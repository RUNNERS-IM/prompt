import { beforeEach, describe, expect, it, vi } from 'vitest'
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

// 「업데이트 자동 확인」을 끄면 자동 확인(시작 · 하루마다)만 건너뛰고, 직접 누르는 확인은 된다.
describe('updater automatic check setting', () => {
  beforeEach(() => {
    resetUpdaterMocks()
    vi.useFakeTimers()
  })

  it('skips the startup and daily checks while the setting is off', async () => {
    const mainWindow = updaterMainWindow(vi.fn())
    const { setupAutoUpdater } = await loadUpdaterModule()

    setupAutoUpdater(mainWindow, {
      getLastUpdateCheckAt: () => Date.now() - 25 * 60 * 60 * 1000,
      isAutomaticCheckOn: () => false
    })
    await vi.advanceTimersByTimeAsync(25 * 60 * 60 * 1000)

    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
  })

  it('still checks when the person asks from the menu', async () => {
    const mainWindow = updaterMainWindow(vi.fn())
    const { checkForUpdatesFromMenu, setupAutoUpdater } = await loadUpdaterModule()

    setupAutoUpdater(mainWindow, {
      getLastUpdateCheckAt: () => Date.now(),
      isAutomaticCheckOn: () => false
    })
    checkForUpdatesFromMenu()

    await vi.waitFor(() => {
      expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1)
    })
  })

  it('checks again on the next daily turn once it is switched back on', async () => {
    const mainWindow = updaterMainWindow(vi.fn())
    let on = false
    const { setupAutoUpdater } = await loadUpdaterModule()

    setupAutoUpdater(mainWindow, {
      getLastUpdateCheckAt: () => Date.now() - 25 * 60 * 60 * 1000,
      isAutomaticCheckOn: () => on
    })
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()

    on = true
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)

    await vi.waitFor(() => {
      expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1)
    })
  })
})
