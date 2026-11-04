import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeAccountSwitchRunningSessions } from '../../../shared/claude-account-switch-settings'
import { findClaudeLoginFollowers } from './claude-login-followers'
import {
  getClaudeAccountSwitchPrompt,
  handleRunningClaudeSessionsAfterLogin,
  resetClaudeAccountSwitchSessionsForTests
} from './claude-account-switch-sessions'

const store = vi.hoisted(() => ({
  settings: {} as { claudeAccountSwitchRunningSessions?: ClaudeAccountSwitchRunningSessions },
  queuePaneAccountRestarts: vi.fn(),
  consumePendingPaneAccountRestart: vi.fn()
}))
const toastSuccess = vi.hoisted(() => vi.fn())

vi.mock('@/store', () => ({ useAppStore: { getState: () => store } }))
vi.mock('sonner', () => ({ toast: { success: toastSuccess } }))
vi.mock('./claude-login-followers', () => ({ findClaudeLoginFollowers: vi.fn() }))

const follower = { ptyId: 'pty-2', worktreeId: 'wt-1', tabId: 'tab-2', leafId: 'leaf-2' }
const HOST = { accounts: [], systemDefaultEmail: 'support@example.com' }

describe('handleRunningClaudeSessionsAfterLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetClaudeAccountSwitchSessionsForTests()
    store.settings = {}
    vi.mocked(findClaudeLoginFollowers).mockResolvedValue({
      accountId: null,
      sessions: [follower]
    })
  })

  it('asks about the other sessions on the login folder by default', async () => {
    await expect(
      handleRunningClaudeSessionsAfterLogin({ paneKey: 'tab-1:leaf-1', host: HOST })
    ).resolves.toBe('handled')
    expect(findClaudeLoginFollowers).toHaveBeenCalledWith({
      loginPaneKey: 'tab-1:leaf-1',
      host: HOST
    })
    expect(getClaudeAccountSwitchPrompt()).toMatchObject({
      sessions: { onAccount: [follower], elsewhere: [], cantMove: [] },
      nextAccountLabel: 'support@example.com'
    })
    expect(store.queuePaneAccountRestarts).not.toHaveBeenCalled()
  })

  it('restarts them at once when the setting says always restart', async () => {
    store.settings = { claudeAccountSwitchRunningSessions: 'restart' }
    await handleRunningClaudeSessionsAfterLogin({ paneKey: 'tab-1:leaf-1', host: HOST })
    expect(store.queuePaneAccountRestarts).toHaveBeenCalledWith(['pty-2'], 'claude')
    expect(toastSuccess).toHaveBeenCalled()
    expect(getClaudeAccountSwitchPrompt()).toBeNull()
  })

  it('does nothing when the setting says never restart or no other session shares the login', async () => {
    store.settings = { claudeAccountSwitchRunningSessions: 'keep' }
    await expect(handleRunningClaudeSessionsAfterLogin({ paneKey: 'tab-1:leaf-1' })).resolves.toBe(
      'nothing'
    )
    expect(findClaudeLoginFollowers).not.toHaveBeenCalled()

    store.settings = {}
    vi.mocked(findClaudeLoginFollowers).mockResolvedValue({ accountId: null, sessions: [] })
    await expect(handleRunningClaudeSessionsAfterLogin({ paneKey: 'tab-1:leaf-1' })).resolves.toBe(
      'nothing'
    )
    expect(getClaudeAccountSwitchPrompt()).toBeNull()
  })
})
