import { app, autoUpdater as nativeUpdater } from 'electron'
import type { UpdateStatus } from '../shared/update-status-types'
import { recordUpdaterLifecycle } from './updater-lifecycle-diagnostics'

const MAC_INSTALL_READY_TIMEOUT_MS = 15000
/** How long a finished download may wait for Squirrel to stage it before the app gives up on it. */
export const MAC_SQUIRREL_STAGING_TIMEOUT_MS = 120_000

export function registerMacUpdaterEvents({
  getCurrentStatus,
  hasInstallableDownloadedVersion,
  getPendingInstallVersion,
  getKnownReleaseUrl,
  performQuitAndInstall,
  commitStagedMacInstall,
  failMacStaging,
  shouldDeferMacQuitForInstall,
  sendStatus
}: {
  getCurrentStatus: () => UpdateStatus
  hasInstallableDownloadedVersion: () => boolean
  getPendingInstallVersion: () => string
  getKnownReleaseUrl: () => string | undefined
  performQuitAndInstall: () => void | Promise<void>
  commitStagedMacInstall: () => void
  failMacStaging: (error: unknown) => void
  shouldDeferMacQuitForInstall: () => boolean
  sendStatus: (status: UpdateStatus) => void
}): void {
  if (process.platform === 'darwin') {
    nativeUpdater.on('error', failMacStaging)
    nativeUpdater.on('update-downloaded', () => {
      // Commit before MacUpdater's later listener calls app.quit.
      commitStagedMacInstall()
      const hasInstallableVersion = hasInstallableDownloadedVersion()
      handleMacInstallerReady(hasInstallableVersion, performQuitAndInstall, () => {
        sendStatus({
          state: 'downloaded',
          version: getPendingInstallVersion(),
          releaseUrl: getKnownReleaseUrl()
        })
      })
    })
  }

  // Veto before other listeners start shutting down services.
  app.prependListener('before-quit', (event) => {
    if (!shouldDeferMacQuitForInstall()) {
      return
    }
    // A second quit must not tear down services during install preflight.
    if (macInstallPreflightInProgress) {
      event.preventDefault()
      return
    }
    if (shouldBypassMacInstallGuard()) {
      recordUpdaterLifecycle('macos_before_quit_guard_bypassed')
      return
    }
    if (isMacQuitAndInstallInFlight()) {
      return
    }
    if (
      deferMacQuitUntilInstallerReady(
        getCurrentStatus(),
        hasInstallableDownloadedVersion(),
        getPendingInstallVersion,
        sendStatus,
        'quit'
      )
    ) {
      recordUpdaterLifecycle('macos_before_quit_deferred', {
        version: getPendingInstallVersion()
      })
      event.preventDefault()
    }
  })
}

let squirrelReady = false
let macInstallPreflightInProgress = false

export function setMacInstallPreflightInProgress(value: boolean): void {
  macInstallPreflightInProgress = value
  if (value) {
    bypassMacInstallGuardUntilNextAttempt = false
  }
}
// Defer early quit/install requests until Squirrel stages the update, or the update is lost.
let requestedActionAfterSquirrelReady: 'quit' | 'install' | null = null
// Do not re-block the shutdown triggered by quitAndInstall.
let quitAndInstallInFlight = false
// Timeout recovery must allow both quit passes.
let bypassMacInstallGuardUntilNextAttempt = false
let pendingInstallTimeout: ReturnType<typeof setTimeout> | null = null

function clearPendingInstallTimeout(): void {
  if (pendingInstallTimeout) {
    clearTimeout(pendingInstallTimeout)
    pendingInstallTimeout = null
  }
}

export function resetMacInstallState(): void {
  macInstallPreflightInProgress = false
  requestedActionAfterSquirrelReady = null
  quitAndInstallInFlight = false
  bypassMacInstallGuardUntilNextAttempt = false
  clearPendingInstallTimeout()
}

export function beginMacUpdateDownload(): void {
  resetMacInstallState()
  clearMacSquirrelStagingWatchdog()
  squirrelReady = false
}

let squirrelStagingWatchdog: ReturnType<typeof setTimeout> | null = null
// One fresh download per version; a second stall is reported instead of looping.
let squirrelStagingRetriedVersion: string | null = null

function clearMacSquirrelStagingWatchdog(): void {
  if (squirrelStagingWatchdog) {
    clearTimeout(squirrelStagingWatchdog)
    squirrelStagingWatchdog = null
  }
}

/**
 * A finished download sits at "downloading 100%" until Squirrel reports it staged, and nothing
 * bounds that wait. When Squirrel stays silent, download once more (it re-feeds Squirrel); if
 * that stalls too, report an error the card and `prompt app update` can show and retry.
 */
export function armMacSquirrelStagingWatchdog({
  version,
  retryDownload,
  sendStatus,
  timeoutMs = MAC_SQUIRREL_STAGING_TIMEOUT_MS
}: {
  version: string
  retryDownload: () => void
  sendStatus: (status: UpdateStatus) => void
  timeoutMs?: number
}): void {
  if (process.platform !== 'darwin') {
    return
  }
  clearMacSquirrelStagingWatchdog()
  squirrelStagingWatchdog = setTimeout(() => {
    squirrelStagingWatchdog = null
    if (squirrelReady || quitAndInstallInFlight) {
      return
    }
    const retry = squirrelStagingRetriedVersion !== version
    recordUpdaterLifecycle(
      'macos_squirrel_staging_timeout',
      { version, timeoutMs, retry },
      {
        level: 'warn',
        message: `macOS installer did not stage ${version} within ${timeoutMs}ms`
      }
    )
    requestedActionAfterSquirrelReady = null
    clearPendingInstallTimeout()
    // An error status with the version lets downloadUpdate start again for the same target.
    sendStatus({
      state: 'error',
      message: retry
        ? 'The update finished downloading but macOS did not prepare it. Downloading again.'
        : 'The update finished downloading but macOS did not prepare it for install. Retry the download, or quit and reopen Prompt.',
      version
    })
    if (retry) {
      squirrelStagingRetriedVersion = version
      retryDownload()
    }
  }, timeoutMs)
}

export function markMacQuitAndInstallInFlight(): void {
  requestedActionAfterSquirrelReady = null
  quitAndInstallInFlight = true
  bypassMacInstallGuardUntilNextAttempt = false
  clearPendingInstallTimeout()
}

function shouldBypassMacInstallGuard(): boolean {
  return bypassMacInstallGuardUntilNextAttempt
}

export function isMacInstallRequested(): boolean {
  return requestedActionAfterSquirrelReady === 'install'
}

export function isMacQuitAndInstallInFlight(): boolean {
  return quitAndInstallInFlight
}

export function isMacInstallerReady(): boolean {
  return squirrelReady
}

export function isWaitingForMacInstallerReadiness(
  currentStatus: UpdateStatus,
  hasNewerDownloadedVersion: boolean
): boolean {
  if (process.platform !== 'darwin' || squirrelReady || !hasNewerDownloadedVersion) {
    return false
  }

  // electron-updater reports completion before Squirrel stages; hold quits until native readiness.
  return currentStatus.state === 'downloading' && currentStatus.percent === 100
}

export function deferMacQuitUntilInstallerReady(
  currentStatus: UpdateStatus,
  hasNewerDownloadedVersion: boolean,
  getPendingInstallVersion: () => string,
  sendStatus: (status: UpdateStatus) => void,
  intent: 'quit' | 'install' = 'install'
): boolean {
  if (!isWaitingForMacInstallerReadiness(currentStatus, hasNewerDownloadedVersion)) {
    return false
  }

  if (intent === 'install') {
    bypassMacInstallGuardUntilNextAttempt = false
  }
  if (intent === 'install' || requestedActionAfterSquirrelReady !== 'install') {
    requestedActionAfterSquirrelReady = intent
  }
  sendStatus({ state: 'downloading', percent: 100, version: getPendingInstallVersion() })

  if (pendingInstallTimeout) {
    return true
  }

  pendingInstallTimeout = setTimeout(() => {
    pendingInstallTimeout = null
    if (!requestedActionAfterSquirrelReady || quitAndInstallInFlight) {
      return
    }

    recordUpdaterLifecycle(
      'macos_install_guard_timeout',
      { timeoutMs: MAC_INSTALL_READY_TIMEOUT_MS },
      {
        level: 'warn',
        message: `macOS installer was not ready after ${MAC_INSTALL_READY_TIMEOUT_MS}ms; allowing quit without install`
      }
    )
    requestedActionAfterSquirrelReady = null
    // Native readiness may never arrive; let the user quit rather than trapping the app.
    bypassMacInstallGuardUntilNextAttempt = true
    app.quit()
  }, MAC_INSTALL_READY_TIMEOUT_MS)

  return true
}

export function handleMacInstallerReady(
  hasNewerDownloadedVersion: boolean,
  onReadyToInstall: () => void | Promise<void>,
  onReadyToReportDownloaded: () => void
): void {
  squirrelReady = true
  clearPendingInstallTimeout()
  clearMacSquirrelStagingWatchdog()
  squirrelStagingRetriedVersion = null
  recordUpdaterLifecycle('macos_installer_ready', {
    deferredInstallRequested: requestedActionAfterSquirrelReady === 'install',
    deferredQuitRequested: requestedActionAfterSquirrelReady === 'quit',
    hasNewerDownloadedVersion
  })

  if (requestedActionAfterSquirrelReady === 'quit') {
    requestedActionAfterSquirrelReady = null
    app.quit()
    return
  }

  if (requestedActionAfterSquirrelReady === 'install' && hasNewerDownloadedVersion) {
    setMacInstallPreflightInProgress(true)
    void Promise.resolve()
      .then(() => onReadyToInstall())
      .catch((error) => {
        requestedActionAfterSquirrelReady = null
        setMacInstallPreflightInProgress(false)
        recordUpdaterLifecycle(
          'macos_deferred_install_handoff_failed',
          { errorType: error instanceof Error ? error.name : typeof error },
          { level: 'warn', message: 'Deferred macOS install handoff failed' }
        )
      })
    return
  }

  requestedActionAfterSquirrelReady = null
  if (hasNewerDownloadedVersion) {
    onReadyToReportDownloaded()
  }
}
