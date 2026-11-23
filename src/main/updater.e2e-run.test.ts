import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadUpdaterModule, warmUpdaterModule } from './updater-test-module-loader'
import { updaterMainWindow } from './updater-test-main-window'

const { autoUpdaterMock, moduleFactories, resetUpdaterMocks } = await vi.hoisted(async () =>
  (await import('./updater-test-harness')).createUpdaterMocks()
)

vi.mock('electron', () => moduleFactories.electron())
vi.mock('electron-updater', () => moduleFactories.electronUpdater())
vi.mock('./electron-updater-loader', () => moduleFactories.electronUpdaterLoader())
vi.mock('./ipc/pty/kill-all', () => moduleFactories.ptyKillAll())
vi.mock('./linux-update-package-type', () => moduleFactories.linuxUpdatePackageType())
vi.mock('./updater-lifecycle-diagnostics', () => moduleFactories.updaterLifecycleDiagnostics())
vi.mock('./updater-changelog', () => moduleFactories.updaterChangelog())
vi.mock('./updater-nudge', () => moduleFactories.updaterNudge())
vi.mock('./update-install-exit-watchdog', () => moduleFactories.updateInstallExitWatchdog())
vi.mock('./updater-prerelease-feed', () => moduleFactories.updaterPrereleaseFeed())
vi.mock('./local-builds/local-build-switch', () => moduleFactories.localBuildSwitch())
vi.mock('./local-builds/local-build-feed-server', () => moduleFactories.localBuildFeedServer())

warmUpdaterModule()

// A packaged app launched for test shots once found a newer release, quit mid-run to install it,
// and was relaunched by ShipIt without its disposable home.
describe('updater in a packaged test run', () => {
  beforeEach(() => {
    resetUpdaterMocks()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('never checks for or installs updates while a disposable user data dir is set', async () => {
    vi.stubEnv('ORCA_E2E_USER_DATA_DIR', '/tmp/prompt-test-shots/ud')
    const { setupAutoUpdater } = await loadUpdaterModule()

    setupAutoUpdater(updaterMainWindow(vi.fn()), {
      getLastUpdateCheckAt: () => Date.now() - 25 * 60 * 60 * 1000,
      isAutomaticCheckOn: () => true
    })
    await vi.advanceTimersByTimeAsync(25 * 60 * 60 * 1000)

    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
  })

  it('checks as usual outside a test run', async () => {
    vi.stubEnv('ORCA_E2E_USER_DATA_DIR', '')
    const { setupAutoUpdater } = await loadUpdaterModule()

    setupAutoUpdater(updaterMainWindow(vi.fn()), {
      getLastUpdateCheckAt: () => Date.now() - 25 * 60 * 60 * 1000,
      isAutomaticCheckOn: () => true
    })
    await vi.advanceTimersByTimeAsync(25 * 60 * 60 * 1000)

    await vi.waitFor(() => expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalled())
  })
})
