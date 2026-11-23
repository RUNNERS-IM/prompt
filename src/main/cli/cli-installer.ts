import { mkdir, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { CliInstallStatus } from '../../shared/cli-install-types'
import {
  pruneAppImageExtractedRoots,
  removeAppImageInstalledPayloads
} from './appimage-extraction-pruning'
import { withAppImageRegistrationLock } from './appimage-registration-lock'
import {
  isAppImageInstalledLauncherCurrent,
  isAppImageInstalledLauncherOwnedBySibling,
  resolveAppImageNamespacePath,
  resolveLegacyAppImageNamespacePath
} from './appimage-extracted-root'
import { isAppImageStableLauncherReady } from './appimage-stable-launcher'
import { LEGACY_MAC_COMMAND_NAME } from './cli-install-constants'
import { CliPathRegistration } from './cli-path-registration'
import { removeLinuxBareOrcaDispatcher } from './linux-bare-orca-dispatcher'

export class CliInstaller extends CliPathRegistration {
  isAppImageRegistrationOwnedBySibling(status: CliInstallStatus): boolean {
    if (
      status.currentTarget !== status.launcherPath ||
      !isAppImageStableLauncherReady(this.appImageCacheRootPath)
    ) {
      return false
    }
    const extractionOptions = this.appImageExtractionOptions()
    return Boolean(
      extractionOptions && isAppImageInstalledLauncherOwnedBySibling(extractionOptions)
    )
  }

  async getStatus(): Promise<CliInstallStatus> {
    const defaultSpec = this.resolveInstallSpec()
    if (!defaultSpec) {
      return {
        platform: this.platform,
        commandName: this.commandName,
        commandPath: null,
        pathDirectory: null,
        pathConfigured: false,
        launcherPath: null,
        installMethod: null,
        supported: false,
        state: 'unsupported',
        currentTarget: null,
        unsupportedReason: 'platform_not_supported',
        detail: 'CLI registration is not implemented on this platform.'
      }
    }

    const launcherPath = await this.resolveLauncherPath()
    if (!launcherPath) {
      const detail = this.hasUnverifiedAppImageRuntime
        ? 'Orca could not verify the inherited AppImage runtime identity, so CLI registration is unavailable.'
        : this.isLinuxAppImage() && this.appImagePath
          ? `The AppImage file at ${this.appImagePath} is missing. Move it back or re-run CLI registration from the current AppImage location.`
          : this.isPackaged
            ? 'The bundled CLI launcher is missing from this Orca build.'
            : 'Development mode uses a generated launcher for validation only.'
      return {
        platform: this.platform,
        commandName: this.commandName,
        commandPath: defaultSpec.commandPath,
        pathDirectory: dirname(defaultSpec.commandPath),
        pathConfigured: false,
        launcherPath: null,
        installMethod: defaultSpec.installMethod,
        supported: false,
        state: 'unsupported',
        currentTarget: null,
        unsupportedReason: this.isPackaged ? 'launcher_missing' : 'launch_mode_unavailable',
        detail
      }
    }

    return this.getStatusForLauncher(launcherPath)
  }

  private async getStatusForLauncher(launcherPath: string): Promise<CliInstallStatus> {
    const defaultSpec = this.resolveInstallSpec()
    if (!defaultSpec) {
      throw new Error('CLI registration is not implemented on this platform.')
    }
    const spec = await this.resolveActiveInstallSpec(defaultSpec, launcherPath)
    const inspectedStatus =
      spec.installMethod === 'symlink'
        ? await this.inspectSymlink(spec.commandPath, launcherPath)
        : await this.inspectWindowsWrapper(spec.commandPath, launcherPath)
    const extractionOptions = this.appImageExtractionOptions()
    const baseStatus =
      inspectedStatus.state === 'installed' &&
      extractionOptions &&
      !isAppImageInstalledLauncherCurrent(extractionOptions)
        ? {
            ...inspectedStatus,
            state: 'stale' as const,
            detail: `${spec.commandPath} does not point to the current Orca AppImage payload.`
          }
        : inspectedStatus
    const pathDirectory = dirname(spec.commandPath)
    const pathProbe = await this.probePathConfiguration(pathDirectory)
    const legacyStatus = await this.withLegacyMacOrcaCommandStatus(baseStatus)
    return this.withPathInfo(legacyStatus, pathDirectory, pathProbe)
  }

  /**
   * `orca` links older Prompt builds registered beside `prompt` on macOS. Each entry pairs the
   * link with the launcher it would have pointed to in this app, so inspectSymlink can tell a
   * Prompt-owned link (this app or another *.app, even a deleted one) from someone else's `orca`.
   */
  private macLegacyOrcaCommands(
    status: Pick<CliInstallStatus, 'commandPath' | 'launcherPath'>
  ): { commandPath: string; launcherPath: string }[] {
    if (
      this.platform !== 'darwin' ||
      !this.isPackaged ||
      this.commandPathOverride ||
      !status.commandPath ||
      !status.launcherPath
    ) {
      return []
    }
    const launcherPath = join(dirname(status.launcherPath), LEGACY_MAC_COMMAND_NAME)
    const registeredPath = status.commandPath
    const commandPaths = new Set([
      join(dirname(registeredPath), LEGACY_MAC_COMMAND_NAME),
      join(this.homePath, '.local', 'bin', LEGACY_MAC_COMMAND_NAME)
    ])
    // Why: a custom default path may itself be named `orca`; never undo the command just registered.
    return [...commandPaths]
      .filter((commandPath) => commandPath !== registeredPath)
      .map((commandPath) => ({ commandPath, launcherPath }))
  }

  // Why: a Mac that already has `prompt` never registers again, so an old `orca` link would stay
  // pointing at a launcher this build no longer ships. Reading as stale makes Settings offer it.
  private async withLegacyMacOrcaCommandStatus(
    status: CliInstallStatus
  ): Promise<CliInstallStatus> {
    if (status.state !== 'installed') {
      return status
    }
    for (const legacy of this.macLegacyOrcaCommands(status)) {
      const legacyStatus = await this.inspectSymlink(legacy.commandPath, legacy.launcherPath)
      if (legacyStatus.state === 'installed' || legacyStatus.state === 'stale') {
        return {
          ...status,
          state: 'stale',
          detail: `${legacy.commandPath} is an old \`orca\` command from an earlier Prompt. Register again to remove it; \`prompt\` keeps working.`
        }
      }
    }
    return status
  }

  // Someone else's `orca` reads as a conflict and stays; only Prompt's own old links go.
  private async removeLegacyMacOrcaCommands(status: CliInstallStatus): Promise<void> {
    for (const legacy of this.macLegacyOrcaCommands(status)) {
      try {
        const legacyStatus = await this.inspectSymlink(legacy.commandPath, legacy.launcherPath)
        if (legacyStatus.state === 'installed' || legacyStatus.state === 'stale') {
          await this.removeSymlink(legacy.commandPath, legacy.launcherPath)
        }
      } catch (error) {
        // Why: `prompt` is already registered or removed; a leftover `orca` link must not fail it.
        console.warn(
          `[cli] Could not remove the old command at ${legacy.commandPath}:`,
          error instanceof Error ? error.message : String(error)
        )
      }
    }
  }

  async install(): Promise<CliInstallStatus> {
    return this.runAppImageRegistrationOperation(() => this.installUnlocked())
  }

  private async installUnlocked(): Promise<CliInstallStatus> {
    const initialStatus = await this.getStatus()
    if (
      !initialStatus.supported ||
      !initialStatus.commandPath ||
      !initialStatus.launcherPath ||
      !initialStatus.installMethod
    ) {
      throw new Error(initialStatus.detail ?? 'CLI registration is unavailable on this build.')
    }
    if (initialStatus.state === 'conflict') {
      throw new Error(
        `Refusing to replace non-Orca command at ${initialStatus.commandPath}. Remove it and register again if it is no longer needed.`
      )
    }
    const extractedRoot = await this.ensureLinuxAppImagePayload()
    const status = extractedRoot
      ? await this.getStatusForLauncher(extractedRoot.stableLauncherPath)
      : initialStatus
    if (!status.supported || !status.commandPath || !status.launcherPath || !status.installMethod) {
      throw new Error(status.detail ?? 'CLI registration is unavailable on this build.')
    }
    if (status.state === 'conflict') {
      throw new Error(
        `Refusing to replace non-Orca command at ${status.commandPath}. Remove it and register again if it is no longer needed.`
      )
    }

    if (status.installMethod === 'symlink') {
      await this.installSymlink(status)
      await this.removeLegacyMacOrcaCommands(status)
      await this.removeLegacyLinuxCommandIfManaged(status.launcherPath)
    } else if (this.isWindowsPackagedBundledCommand(status.commandPath, status.launcherPath)) {
      // Why: packaged Windows already ships resources/bin/orca.exe; registration only owns the PATH entry.
    } else {
      await mkdir(dirname(status.commandPath), { recursive: true })
      await this.installWindowsWrapper(status.commandPath, status.launcherPath)
    }

    if (this.platform === 'win32') {
      await this.ensureWindowsPathEntry(dirname(status.commandPath))
    }
    if (extractedRoot) {
      await pruneAppImageExtractedRoots(
        extractedRoot.rootPath,
        this.legacyAppImageNamespacePath() ?? undefined
      )
    }

    return extractedRoot
      ? this.getStatusForLauncher(extractedRoot.stableLauncherPath)
      : this.getStatus()
  }

  async remove(): Promise<CliInstallStatus> {
    return this.runAppImageRegistrationOperation(() => this.removeUnlocked())
  }

  private async removeUnlocked(): Promise<CliInstallStatus> {
    await this.removeLinuxBareOrcaDispatcher()
    const status = await this.getStatus()
    if (!status.supported || !status.commandPath || !status.launcherPath || !status.installMethod) {
      await this.removeLinuxAppImagePayloads()
      return status
    }
    if (status.state === 'not_installed') {
      await this.removeLegacyLinuxCommandIfManaged(status.launcherPath)
      if (this.platform === 'win32') {
        await this.removeWindowsPathEntry(dirname(status.commandPath))
        return this.getStatus()
      }
      await this.removeLinuxAppImagePayloads()
      return status
    }
    if (status.state === 'conflict') {
      throw new Error(`Refusing to remove non-Orca command at ${status.commandPath}.`)
    }
    if (status.state === 'stale' && status.installMethod !== 'symlink') {
      throw new Error(`Refusing to remove a command not owned by Orca at ${status.commandPath}.`)
    }

    if (status.state === 'stale' && this.isAppImageRegistrationOwnedBySibling(status)) {
      await this.removeLinuxAppImagePayloads()
      return this.getStatus()
    }

    if (status.installMethod === 'symlink') {
      await this.removeSymlink(status.commandPath)
      await this.removeLegacyMacOrcaCommands(status)
      await this.removeLegacyLinuxCommandIfManaged(status.launcherPath)
    } else if (this.isWindowsPackagedBundledCommand(status.commandPath, status.launcherPath)) {
      await this.removeWindowsPathEntry(dirname(status.commandPath))
    } else {
      await unlink(status.commandPath)
      await this.removeWindowsPathEntry(dirname(status.commandPath))
    }

    await this.removeLinuxAppImagePayloads()
    return this.getStatus()
  }

  // Removing the `orca` command also retires the bare-name dispatcher headless serve installed.
  private async removeLinuxBareOrcaDispatcher(): Promise<void> {
    if (this.platform !== 'linux' || this.commandPathOverride) {
      return
    }
    try {
      await removeLinuxBareOrcaDispatcher(this.homePath)
    } catch (error) {
      console.warn(
        '[cli] Could not remove the bare orca dispatcher:',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  private async removeLinuxAppImagePayloads(): Promise<void> {
    const extractionOptions = this.appImageExtractionOptions()
    if (this.isLinuxAppImage() && extractionOptions) {
      await removeAppImageInstalledPayloads(resolveAppImageNamespacePath(extractionOptions))
      await removeAppImageInstalledPayloads(resolveLegacyAppImageNamespacePath(extractionOptions))
    }
  }

  private legacyAppImageNamespacePath(): string | null {
    const extractionOptions = this.appImageExtractionOptions()
    return extractionOptions ? resolveLegacyAppImageNamespacePath(extractionOptions) : null
  }

  private runAppImageRegistrationOperation<T>(operation: () => Promise<T>): Promise<T> {
    return this.isLinuxAppImage()
      ? withAppImageRegistrationLock(this.appImageCacheRootPath, operation, {
          deadlineAt: this.appImageDeadlineAt
        })
      : operation()
  }
}
