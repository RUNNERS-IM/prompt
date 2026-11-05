import {
  beginMacUpdateDownload,
  deferMacQuitUntilInstallerReady,
  isMacInstallRequested,
  setMacInstallPreflightInProgress
} from '../updater-mac-install'
import { recordUpdaterLifecycle } from '../updater-lifecycle-diagnostics'
import { isExternallyManagedLinuxInstall } from '../linux-update-package-type'
import { updaterCodedMessage } from '../../shared/updater-failure-copy'
import { QUIT_AND_INSTALL_DELAY_MS } from './updater-state'

/** How long the window gets to back up editors and call Install before main installs anyway. */
export const RENDERER_INSTALL_REQUEST_TIMEOUT_MS = 30_000
import { UpdaterRemoteStatus } from './updater-remote-status'
import { prepareThisProcessShipItStaging } from './shipit-leftover-recovery'

export abstract class UpdaterDownloadInstall extends UpdaterRemoteStatus {
  protected quitAndInstall(): void {
    this.clearRendererInstallRequest()
    if (
      this.localBuildSelectionInProgress ||
      this.pinnedBuildSelectionInProgress ||
      this.pendingQuitAndInstallTimer ||
      this.quitAndInstallInProgress ||
      isMacInstallRequested()
    ) {
      return
    }

    if (this.deferHeadlessServeInstall('install', this.getPendingInstallVersion())) {
      return
    }
    // A queued check must not repoint the feed while native staging or installation is pending.
    this.finishActiveUpdateCheckAttempt()
    this.clearBackgroundCheckLaunchPending()
    if (
      !this.isMacStagingDeferredToInstall() &&
      deferMacQuitUntilInstallerReady(
        this.currentStatus,
        this.hasInstallableDownloadedVersion(),
        () => this.getPendingInstallVersion(),
        (status) => this.sendStatus(status)
      )
    ) {
      return
    }

    if (process.platform === 'darwin') {
      setMacInstallPreflightInProgress(true)
    }
    // Defer quit one tick so the renderer can flush state before windows close.
    this.pendingQuitAndInstallTimer = setTimeout(() => {
      void this.performQuitAndInstall()
    }, QUIT_AND_INSTALL_DELAY_MS)
  }

  protected downloadUpdate(): void {
    if (
      this.localBuildSelectionInProgress ||
      this.pinnedBuildSelectionInProgress ||
      this.pendingQuitAndInstallTimer ||
      this.quitAndInstallInProgress ||
      isMacInstallRequested() ||
      this.downloadInFlight
    ) {
      return
    }
    // Retain availableVersion after errors so Retry Download still works.
    const canStart =
      this.currentStatus.state === 'available' ||
      (this.currentStatus.state === 'error' && this.hasInstallableDownloadedVersion())
    if (!canStart) {
      return
    }
    const version =
      this.currentStatus.state === 'available' ? this.currentStatus.version : this.availableVersion
    if (!version) {
      return
    }
    // Enforce host installability in main for older renderers and direct IPC callers.
    if (isExternallyManagedLinuxInstall()) {
      recordUpdaterLifecycle('linux_package_externally_managed_download_blocked', {
        version
      })
      // A refused Linux pin still owns the release feed; unwind it or background checks remain disabled.
      this.clearAvailableUpdateContext()
      this.restoreReleaseUpdateSource()
      this.sendStatus({
        state: 'error',
        ...updaterCodedMessage('linuxPackageExternallyManaged'),
        version,
        retryable: false
      })
      return
    }
    if (this.deferHeadlessServeInstall('download', version)) {
      return
    }
    this.downloadInFlight = true
    const localBuildDownload = this.activeUpdateSource === 'local'
    beginMacUpdateDownload()
    // Acknowledge acceptance before setup delays progress events so the card responds immediately.
    this.sendStatus({ state: 'downloading', percent: 0, version })
    const startDownload = (): void => {
      this.getAutoUpdater()
        .downloadUpdate()
        .catch((err) => {
          this.downloadInFlight = false
          const message = String(err?.message ?? err)
          if (localBuildDownload) {
            this.sendLocalBuildErrorAndRestore(message)
          } else {
            this.sendErrorStatus(message)
          }
        })
    }
    // Prepare before download because Squirrel stages on completion unless staging is deferred to install.
    const preparingStaging = this.isMacStagingDeferredToInstall()
      ? null
      : prepareThisProcessShipItStaging()
    if (preparingStaging) {
      void preparingStaging.then(startDownload)
    } else {
      startDownload()
    }
  }

  /**
   * An install asked for from outside the window (`prompt app update`) goes through the window's
   * own Install path, so unsaved editors get their hot-exit backup and the shutdown checkpoint
   * runs before the quit. Without a window, or when the window never answers, install directly.
   */
  protected requestRendererPreparedInstall(): void {
    const win = this.mainWindowRef
    const windowCanPrepare =
      this.updateInstallMode === 'interactive' &&
      !!win &&
      !win.isDestroyed() &&
      !win.webContents.isDestroyed() &&
      !win.webContents.isCrashed()
    if (!windowCanPrepare) {
      this.quitAndInstall()
      return
    }
    this.clearRendererInstallRequest()
    this.rendererInstallRequestTimer = setTimeout(() => {
      this.rendererInstallRequestTimer = null
      if (
        this.pendingQuitAndInstallTimer ||
        this.quitAndInstallInProgress ||
        isMacInstallRequested()
      ) {
        return
      }
      recordUpdaterLifecycle('renderer_install_request_unanswered', {
        timeoutMs: RENDERER_INSTALL_REQUEST_TIMEOUT_MS
      })
      this.quitAndInstall()
    }, RENDERER_INSTALL_REQUEST_TIMEOUT_MS)
    recordUpdaterLifecycle('renderer_install_requested')
    this.sendToMainWindow('updater:installRequested')
  }

  /** The window tried and refused (its checkpoint failed); leave the app running, as its button does. */
  protected declineRendererInstallRequest(): void {
    if (!this.rendererInstallRequestTimer) {
      return
    }
    this.clearRendererInstallRequest()
    recordUpdaterLifecycle('renderer_install_request_declined')
  }

  protected clearRendererInstallRequest(): void {
    if (this.rendererInstallRequestTimer) {
      clearTimeout(this.rendererInstallRequestTimer)
      this.rendererInstallRequestTimer = null
    }
  }

  protected isQuittingForUpdate(): boolean {
    return this.quittingForUpdate
  }
}
