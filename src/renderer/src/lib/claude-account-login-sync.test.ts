import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeAccountSwitchRunningSessions } from '../../../shared/claude-account-switch-settings'
import { findClaudeLoginFollowers } from './claude-login-followers'
import { resetClaudeAccountRestartToastForTests } from './claude-account-restart-toast'
import {
  getClaudeAccountSwitchPrompt,
  handleRunningClaudeSessionsAfterLogin,
  resetClaudeAccountSwitchSessionsForTests
} from './claude-account-switch-sessions'

const store = vi.hoisted(() => ({
  settings: {} as { claudeAccountSwitchRunningSessions?: ClaudeAccountSwitchRunningSessions },
  queuePaneAccountRestarts: vi.fn(),
  consumePendingPaneAccountRestart: vi.fn(),
  agentStatusByPaneKey: {},
  pendingPaneAccountRestarts: {},
  terminalLayoutsByTabId: { 'tab-2': { ptyIdsByLeafId: { 'leaf-2': 'pty-2' } } }
}))
const toastLoading = vi.hoisted(() => vi.fn())

vi.mock('@/store', () => ({ useAppStore: { getState: () => store, subscribe: () => () => {} } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), loading: toastLoading, info: vi.fn() } }))
vi.mock('./active-agent-note-target', () => ({
  findActiveRuntimeTerminal: vi.fn(async () => null)
}))
vi.mock('./claude-login-followers', () => ({ findClaudeLoginFollowers: vi.fn() }))

const follower = { ptyId: 'pty-2', worktreeId: 'wt-1', tabId: 'tab-2', leafId: 'leaf-2' }
const HOST = { accounts: [], systemDefaultEmail: 'support@example.com' }

describe('handleRunningClaudeSessionsAfterLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetClaudeAccountSwitchSessionsForTests()
    resetClaudeAccountRestartToastForTests()
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
    expect(findClaudeLoginFollowers).toHaveBeenCalledWith(
      expect.objectContaining({ loginPaneKey: 'tab-1:leaf-1', host: HOST })
    )
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
    expect(toastLoading).toHaveBeenCalled()
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
