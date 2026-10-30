// Prompt: the upstream updater tests run against Orca's repository (see shared/prompt-upstream).
// This case checks the first feed a real Prompt build hands to electron-updater.
import type * as PromptUpstream from '../shared/prompt-upstream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadUpdaterModule, warmUpdaterModule } from './updater-test-module-loader'
import { updaterMainWindow } from './updater-test-main-window'

const { appMock, autoUpdaterMock, moduleFactories, resetUpdaterMocks } = await vi.hoisted(
  async () => (await import('./updater-test-harness')).createUpdaterMocks()
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

// What every packaged build sees: the switch is only off while Vitest runs.
vi.mock('../shared/prompt-upstream', async (importOriginal) => ({
  ...(await importOriginal<typeof PromptUpstream>()),
  PROMPT_BLOCK_UPSTREAM_SERVICES: true,
  promptOr: <T>(promptValue: T): T => promptValue
}))

warmUpdaterModule()

describe('Prompt default update feed', () => {
  beforeEach(() => {
    resetUpdaterMocks()
  })

  it('points electron-updater at the latest RUNNERS-IM/prompt release', async () => {
    appMock.getVersion.mockReturnValue('2.6.103001')
    const { setupAutoUpdater } = await loadUpdaterModule()

    setupAutoUpdater(updaterMainWindow(vi.fn()), { getLastUpdateCheckAt: () => Date.now() })

    expect(autoUpdaterMock.setFeedURL).toHaveBeenLastCalledWith({
      provider: 'generic',
      url: 'https://github.com/RUNNERS-IM/prompt/releases/latest/download'
    })
  })
})
