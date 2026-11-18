import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadUpdaterModule, warmUpdaterModule } from './updater-test-module-loader'
import { updaterMainWindow } from './updater-test-main-window'

const {
  appMock,
  autoUpdaterMock,
  nativeUpdaterMock,
  recordUpdaterLifecycleMock,
  moduleFactories,
  resetUpdaterMocks,
  idleSecondsMock
} = await vi.hoisted(async () => ({
  ...(await import('./updater-test-harness')).createUpdaterMocks(),
  idleSecondsMock: vi.fn(() => 0)
}))

vi.mock('electron', () => {
  const electron = moduleFactories.electron()
  return {
    ...electron,
    powerMonitor: { ...electron.powerMonitor, getSystemIdleTime: idleSecondsMock }
  }
})
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

const AN_HOUR_AGO = () => Date.now() - 25 * 60 * 60 * 1000
let userData = ''

function statusesSent(send: ReturnType<typeof vi.fn>): Record<string, unknown>[] {
  return send.mock.calls
    .filter(([channel]) => channel === 'updater:status')
    .map(([, status]) => status as Record<string, unknown>)
}

function lifecycleEvents(): string[] {
  return recordUpdaterLifecycleMock.mock.calls.map(([event]) => event as string)
}

async function findUpdate(): Promise<void> {
  await vi.waitFor(() => expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1))
  autoUpdaterMock.emit('checking-for-update')
  autoUpdaterMock.emit('update-available', { version: '1.0.61' })
  await vi.advanceTimersByTimeAsync(0)
}

async function finishDownload(): Promise<void> {
  autoUpdaterMock.emit('update-downloaded', { version: '1.0.61' })
  const nativeReady = nativeUpdaterMock.on.mock.calls.find(
    ([event]) => event === 'update-downloaded'
  )?.[1] as (() => void) | undefined
  nativeReady?.()
  await vi.advanceTimersByTimeAsync(0)
}

// 새 판 저절로 깔기: 저절로 한 확인은 바로 받고 쉬는 중 10분에 깔며, 다음에 열 때 한 번 알린다.
describe('updater auto install', () => {
  beforeEach(() => {
    resetUpdaterMocks()
    vi.useFakeTimers()
    userData = mkdtempSync(path.join(tmpdir(), 'prompt-auto-install-'))
    Object.assign(appMock, { getPath: () => userData })
    idleSecondsMock.mockReset().mockReturnValue(0)
    autoUpdaterMock.downloadUpdate.mockResolvedValue([])
  })

  afterEach(() => {
    rmSync(userData, { recursive: true, force: true })
  })

  it('downloads a version found by the automatic check without showing the card', async () => {
    const send = vi.fn()
    const { setupAutoUpdater } = await loadUpdaterModule()
    setupAutoUpdater(updaterMainWindow(send), { getLastUpdateCheckAt: AN_HOUR_AGO })

    await findUpdate()

    expect(autoUpdaterMock.downloadUpdate).toHaveBeenCalledTimes(1)
    const available = statusesSent(send).find((status) => status.state === 'available')
    expect(available?.autoInstall).toBe(true)
  })

  it('keeps asking with the card when the person checks from the menu', async () => {
    const send = vi.fn()
    const { checkForUpdatesFromMenu, setupAutoUpdater } = await loadUpdaterModule()
    setupAutoUpdater(updaterMainWindow(send), { getLastUpdateCheckAt: () => Date.now() })
    checkForUpdatesFromMenu()

    await findUpdate()

    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled()
    const available = statusesSent(send).find((status) => status.state === 'available')
    expect(available).toBeDefined()
    expect(available?.autoInstall).toBeUndefined()
  })

  it('waits while Claude is writing an answer, then installs after 10 idle minutes', async () => {
    const send = vi.fn()
    let working = 1
    const { downloadUpdate, setupAutoUpdater } = await loadUpdaterModule()
    setupAutoUpdater(updaterMainWindow(send), {
      getLastUpdateCheckAt: AN_HOUR_AGO,
      getWorkingAgentCount: () => working
    })
    await findUpdate()
    downloadUpdate()
    await finishDownload()

    idleSecondsMock.mockReturnValue(9 * 60)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(lifecycleEvents()).not.toContain('auto_install_idle_started')

    idleSecondsMock.mockReturnValue(10 * 60)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(lifecycleEvents()).not.toContain('auto_install_idle_started')

    working = 0
    await vi.advanceTimersByTimeAsync(60_000)
    expect(lifecycleEvents()).toContain('auto_install_idle_started')
  })

  it('shows the updated notice once on the next launch of the downloaded version', async () => {
    const { downloadUpdate, setupAutoUpdater } = await loadUpdaterModule()
    setupAutoUpdater(updaterMainWindow(vi.fn()), { getLastUpdateCheckAt: AN_HOUR_AGO })
    await findUpdate()
    downloadUpdate()
    await finishDownload()

    const record = JSON.parse(readFileSync(path.join(userData, 'prompt-auto-update.json'), 'utf8'))
    expect(record.pendingVersion).toBe('1.0.61')

    vi.resetModules()
    appMock.getVersion.mockReturnValue('1.0.61')
    const relaunched = await loadUpdaterModule()
    expect(relaunched.getAutoUpdatedNotice()).toEqual({
      version: '1.0.61',
      releaseUrl: expect.stringContaining('/releases/tag/v1.0.61')
    })

    relaunched.dismissAutoUpdatedNotice()
    vi.resetModules()
    const again = await loadUpdaterModule()
    expect(again.getAutoUpdatedNotice()).toBeNull()
  })
})
