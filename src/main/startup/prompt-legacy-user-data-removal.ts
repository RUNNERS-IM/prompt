import { existsSync, readdirSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readDaemonPidRecord } from '../daemon/daemon-endpoint-incarnation'
import { readPromptUserDataMarker } from '../../shared/prompt-user-data-location'
import { isUserDataFolderInUse } from './prompt-user-data-migration'

/** Wait out startup work (daemon adoption, previous-version tabs) before touching the disk. */
const REMOVAL_DELAY_MS = 60_000

export type LegacyUserDataRemovalSkipReason =
  | 'not-migrated'
  | 'missing'
  | 'upstream-orca-installed'
  | 'in-use'
  | 'daemon-alive'

export type LegacyUserDataRemovalOptions = {
  /** The folder this launch runs on; its marker names the folder it was copied from. */
  userDataPath: string
  platform?: NodeJS.Platform
  isPidAlive?: (pid: number) => boolean
  isUpstreamOrcaInstalled?: () => boolean
  isFolderInUse?: (dir: string) => boolean
  remove?: (dir: string) => Promise<void>
}

export type LegacyUserDataRemovalResult =
  | { outcome: 'removed'; legacyDir: string }
  | { outcome: 'skipped'; reason: LegacyUserDataRemovalSkipReason }

/**
 * Delete the inherited `orca` folder once Prompt has copied it and nothing runs from it.
 *
 * Terminal daemons started before the move keep their sockets and helper app in the old folder,
 * so the folder stays until the last of them exits; a later launch removes it. Upstream Orca uses
 * the same folder, so a Mac with Orca.app installed keeps it.
 */
export async function removeLegacyUserDataWhenIdle(
  options: LegacyUserDataRemovalOptions
): Promise<LegacyUserDataRemovalResult> {
  const platform = options.platform ?? process.platform
  const isPidAlive = options.isPidAlive ?? defaultIsPidAlive
  const legacyDir = readPromptUserDataMarker(options.userDataPath)?.migratedFrom
  if (!legacyDir || platform !== 'darwin') {
    return { outcome: 'skipped', reason: 'not-migrated' }
  }
  if (!existsSync(legacyDir)) {
    return { outcome: 'skipped', reason: 'missing' }
  }
  if ((options.isUpstreamOrcaInstalled ?? isUpstreamOrcaInstalledOnMac)()) {
    return { outcome: 'skipped', reason: 'upstream-orca-installed' }
  }
  const isFolderInUse = options.isFolderInUse ?? ((dir) => isUserDataFolderInUse(dir, isPidAlive))
  if (isFolderInUse(legacyDir)) {
    return { outcome: 'skipped', reason: 'in-use' }
  }
  if (hasLiveDaemon(legacyDir, isPidAlive)) {
    return { outcome: 'skipped', reason: 'daemon-alive' }
  }
  await (options.remove ?? removeTree)(legacyDir)
  return { outcome: 'removed', legacyDir }
}

export function scheduleLegacyUserDataRemoval(userDataPath: string): void {
  const timer = setTimeout(() => {
    removeLegacyUserDataWhenIdle({ userDataPath })
      .then((result) => {
        if (result.outcome === 'removed') {
          console.warn(`[startup] removed the old data folder ${result.legacyDir}`)
        }
      })
      .catch((error) => console.error('[startup] Could not remove the old data folder', error))
  }, REMOVAL_DELAY_MS)
  timer.unref()
}

/** Any daemon recorded in the folder, whoever started it, still runs from its files. */
function hasLiveDaemon(legacyDir: string, isPidAlive: (pid: number) => boolean): boolean {
  const runtimeDir = join(legacyDir, 'daemon')
  let names: string[]
  try {
    names = readdirSync(runtimeDir)
  } catch {
    return false
  }
  return names.some((name) => {
    if (!/^daemon-v\d+\.pid$/.test(name)) {
      return false
    }
    const record = readDaemonPidRecord(join(runtimeDir, name))
    return record !== null && isPidAlive(record.pid)
  })
}

function isUpstreamOrcaInstalledOnMac(): boolean {
  return [join('/Applications', 'Orca.app'), join(homedir(), 'Applications', 'Orca.app')].some(
    (path) => existsSync(path)
  )
}

async function removeTree(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 2 })
}

function defaultIsPidAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}
