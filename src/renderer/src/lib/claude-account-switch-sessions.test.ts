import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeAccountSwitchRunningSessions } from '../../../shared/claude-account-switch-settings'
import { getDefaultSettings } from '../../../shared/constants'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import type {
  ClaudeManagedAccountSummary,
  ClaudeRateLimitAccountsState
} from '../../../shared/managed-account-types'
import {
  getClaudeStatusActiveId,
  resolveClaudeStatusAccountState
} from '../components/status-bar/status-bar-claude-accounts'
import {
  findClaudeSwitchSessions,
  findQueuedClaudeRestartsOnAccount
} from './claude-session-account-move'
import type * as AccountMove from './claude-session-account-move'
import type { ClaudeSwitchSessions } from './claude-session-account-move'
import {
  answerClaudeAccountSwitchPrompt,
  getClaudeAccountSwitchPrompt,
  handleRunningClaudeSessionsAfterSwitch,
  resetClaudeAccountSwitchSessionsForTests
} from './claude-account-switch-sessions'
import { resetClaudeAccountRestartToastForTests } from './claude-account-restart-toast'

type SwitchSettings = {
  claudeAccountSwitchRunningSessions?: ClaudeAccountSwitchRunningSessions
}

type StoreStub = {
  settings: SwitchSettings
  updateSettings: (updates: SwitchSettings) => Promise<void>
  terminalLayoutsByTabId: Record<string, { ptyIdsByLeafId: Record<string, string> }>
  queuePaneAccountRestarts: (ptyIds: string[], agent: string) => void
  consumePendingPaneAccountRestart: (ptyId: string) => void
  agentStatusByPaneKey: Record<string, unknown>
  pendingPaneAccountRestarts: Record<string, string>
  tabsByWorktree: Record<string, { id: string; title?: string; customTitle?: string }[]>
}

const store = vi.hoisted((): StoreStub => ({
  settings: {},
  terminalLayoutsByTabId: {},
  updateSettings: vi.fn(async () => {}),
  queuePaneAccountRestarts: vi.fn(),
  consumePendingPaneAccountRestart: vi.fn(),
  agentStatusByPaneKey: {},
  pendingPaneAccountRestarts: {},
  tabsByWorktree: {}
}))
const toastSuccess = vi.hoisted(() => vi.fn())
const toastLoading = vi.hoisted(() => vi.fn())
const screenLines = vi.hoisted(() => ({ byTab: {} as Record<string, string[]> }))

vi.mock('@/store', () => ({ useAppStore: { getState: () => store, subscribe: () => () => {} } }))
vi.mock('sonner', () => ({
  toast: { success: toastSuccess, loading: toastLoading, info: vi.fn(), warning: vi.fn() }
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: vi.fn(
    async (_target: unknown, _method: string, params: { terminal: string }) => ({
      terminal: { tail: screenLines.byTab[params.terminal] ?? [] }
    })
  )
}))
vi.mock('./active-agent-note-target', () => ({
  findActiveRuntimeTerminal: vi.fn(async (_t: unknown, _w: string, pane: { tabId: string }) => ({
    handle: pane.tabId
  }))
}))
vi.mock('./claude-session-account-move', async (importOriginal) => ({
  ...(await importOriginal<typeof AccountMove>()),
  findClaudeSwitchSessions: vi.fn(),
  findQueuedClaudeRestartsOnAccount: vi.fn(() => [])
}))

const candidate = (n: number) => ({
  ptyId: `pty-${n}`,
  worktreeId: 'wt-1',
  tabId: `tab-${n}`,
  leafId: `leaf-${n}`
})
// Usage-limit lookups key panes by real leaf ids, which are UUIDs.
const LEAF_1 = '11111111-1111-4111-8111-111111111111'
const LEAF_2 = '22222222-2222-4222-8222-222222222222'
const uuidCandidate = (n: number, leafId: string) => ({
  ...candidate(n),
  leafId
})
const scan = (
  onAccount: ReturnType<typeof candidate>[],
  others: Partial<ClaudeSwitchSessions> = {}
): ClaudeSwitchSessions => ({
  onAccount,
  elsewhere: [],
  cantMove: [],
  ...others
})
const row = (id: string, extra: Partial<ClaudeManagedAccountSummary> = {}) => ({
  id,
  email: `${id}@example.com`,
  managedAuthRuntime: 'host' as const,
  wslDistro: null,
  authMethod: 'subscription-oauth' as const,
  createdAt: 1,
  updatedAt: 1,
  lastAuthenticatedAt: 1,
  ...extra
})
const ROSTER = { accounts: [row('account-a'), row('account-b')] }
const SWITCH = {
  owner: { kind: 'local' } as const,
  target: { runtime: 'host' } as const,
  before: { state: ROSTER, accountId: 'account-a' },
  after: { state: ROSTER, accountId: 'account-b' }
}
const SAME_FOLDER = {
  ...SWITCH,
  before: { state: ROSTER, accountId: null },
  after: { state: ROSTER, accountId: null }
}

describe('handleRunningClaudeSessionsAfterSwitch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetClaudeAccountSwitchSessionsForTests()
    resetClaudeAccountRestartToastForTests()
    store.settings = {}
    store.agentStatusByPaneKey = {}
    screenLines.byTab = {}
    store.terminalLayoutsByTabId = Object.fromEntries(
      [1, 2, 3].map((n) => [
        `tab-${n}`,
        {
          ptyIdsByLeafId: { [`leaf-${n}`]: `pty-${n}`, [[LEAF_1, LEAF_2][n - 1] ?? '']: `pty-${n}` }
        }
      ])
    )
  })

  it('asks nothing when no Claude session runs on the outgoing account', async () => {
    vi.mocked(findClaudeSwitchSessions).mockResolvedValue(scan([]))

    expect(await handleRunningClaudeSessionsAfterSwitch(SWITCH)).toBe('show-confirmation')
    expect(getClaudeAccountSwitchPrompt()).toBeNull()
    expect(findClaudeSwitchSessions).toHaveBeenCalledWith(
      expect.objectContaining({ fromAccountId: 'account-a' })
    )
  })

  it('keeps earlier queued restarts except those already on the new account', async () => {
    vi.mocked(findClaudeSwitchSessions).mockResolvedValue(scan([]))
    vi.mocked(findQueuedClaudeRestartsOnAccount).mockReturnValueOnce(['pty-home'])

    await handleRunningClaudeSessionsAfterSwitch(SWITCH)

    expect(findQueuedClaudeRestartsOnAccount).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'account-b' })
    )
    expect(store.consumePendingPaneAccountRestart).toHaveBeenCalledTimes(1)
    expect(store.consumePendingPaneAccountRestart).toHaveBeenCalledWith('pty-home')
    expect(store.queuePaneAccountRestarts).not.toHaveBeenCalled()
  })

  it('leaves local questions and queued restarts alone on a server account switch', async () => {
    vi.mocked(findClaudeSwitchSessions).mockResolvedValue(scan([candidate(1)]))
    await handleRunningClaudeSessionsAfterSwitch(SWITCH)

    expect(
      await handleRunningClaudeSessionsAfterSwitch({
        ...SWITCH,
        owner: { kind: 'environment', environmentId: 'env-1' }
      })
    ).toBe('show-confirmation')

    expect(
      getClaudeAccountSwitchPrompt()?.sessions.onAccount.map((session) => session.ptyId)
    ).toEqual(['pty-1'])
    expect(findQueuedClaudeRestartsOnAccount).toHaveBeenCalledTimes(1)
  })

  it('restarts on the new account when the user picks Restart', async () => {
    vi.mocked(findClaudeSwitchSessions).mockResolvedValue(scan([candidate(1), candidate(2)]))
    expect(await handleRunningClaudeSessionsAfterSwitch(SWITCH)).toBe('handled')
    expect(
      getClaudeAccountSwitchPrompt()?.sessions.onAccount.map((session) => session.ptyId)
    ).toEqual(['pty-1', 'pty-2'])

    answerClaudeAccountSwitchPrompt('restart')

    await vi.waitFor(() =>
      expect(store.queuePaneAccountRestarts).toHaveBeenLastCalledWith(['pty-1', 'pty-2'], 'claude')
    )
    expect(getClaudeAccountSwitchPrompt()).toBeNull()
    expect(store.updateSettings).not.toHaveBeenCalled()
  })

  it('restarts only the ticked sessions, and only ones this question listed', async () => {
    vi.mocked(findClaudeSwitchSessions).mockResolvedValue(scan([candidate(1), candidate(2)]))
    await handleRunningClaudeSessionsAfterSwitch(SWITCH)

    answerClaudeAccountSwitchPrompt('restart', {
      ptyIds: ['pty-2', 'pty-unlisted']
    })

    await vi.waitFor(() =>
      expect(store.queuePaneAccountRestarts).toHaveBeenLastCalledWith(['pty-2'], 'claude')
    )
  })

  it('restarts a pane on the PTY it has now, and skips a pane that closed', async () => {
    vi.mocked(findClaudeSwitchSessions).mockResolvedValue(scan([candidate(1), candidate(2)]))
    await handleRunningClaudeSessionsAfterSwitch(SWITCH)
    store.terminalLayoutsByTabId = {
      'tab-1': { ptyIdsByLeafId: { 'leaf-1': 'pty-1-reattached' } }
    }

    answerClaudeAccountSwitchPrompt('restart')

    await vi.waitFor(() =>
      expect(store.queuePaneAccountRestarts).toHaveBeenLastCalledWith(
        ['pty-1-reattached'],
        'claude'
      )
    )
  })

  it('asks nothing when launches run on the same folder before and after the switch', async () => {
    vi.mocked(findClaudeSwitchSessions).mockResolvedValue(scan([candidate(1)]))

    expect(await handleRunningClaudeSessionsAfterSwitch(SAME_FOLDER)).toBe('show-confirmation')
    expect(findClaudeSwitchSessions).not.toHaveBeenCalled()
  })

  it('leaves sessions alone when the user keeps them', async () => {
    vi.mocked(findClaudeSwitchSessions).mockResolvedValue(scan([candidate(1)]))
    await handleRunningClaudeSessionsAfterSwitch(SWITCH)

    answerClaudeAccountSwitchPrompt('keep')

    expect(store.queuePaneAccountRestarts).not.toHaveBeenCalled()
    expect(getClaudeAccountSwitchPrompt()).toBeNull()
  })

  it.each(['restart', 'keep'] as const)(
    'turns on automatic restarts on %s when told not to ask again',
    async (answer) => {
      vi.mocked(findClaudeSwitchSessions).mockResolvedValue(scan([candidate(1)]))
      await handleRunningClaudeSessionsAfterSwitch(SWITCH)

      answerClaudeAccountSwitchPrompt(answer, { dontAskAgain: true })

      expect(store.updateSettings).toHaveBeenCalledWith({
        claudeAccountSwitchRunningSessions: 'restart'
      })
    }
  )

  it('restarts without asking when the setting is Always restart', async () => {
    store.settings = { claudeAccountSwitchRunningSessions: 'restart' }
    vi.mocked(findClaudeSwitchSessions).mockResolvedValue(scan([candidate(1), candidate(2)]))

    expect(await handleRunningClaudeSessionsAfterSwitch(SWITCH)).toBe('handled')
    expect(getClaudeAccountSwitchPrompt()).toBeNull()
    expect(store.queuePaneAccountRestarts).toHaveBeenLastCalledWith(['pty-1', 'pty-2'], 'claude')
    expect(toastLoading).toHaveBeenCalledWith(
      'Restarting 2 Claude sessions on account-b@example.com',
      expect.anything()
    )
  })

  it('moves sessions on every account, not only the one being left', async () => {
    store.settings = { claudeAccountSwitchRunningSessions: 'restart' }
    vi.mocked(findClaudeSwitchSessions).mockResolvedValue(
      scan([], { elsewhere: [{ ...candidate(2), accountId: null }] })
    )

    expect(await handleRunningClaudeSessionsAfterSwitch(SWITCH)).toBe('handled')
    expect(store.queuePaneAccountRestarts).toHaveBeenLastCalledWith(['pty-2'], 'claude')
  })

  it('counts a session waiting on the usage-limit picker as stopped at the limit', async () => {
    store.settings = { claudeAccountSwitchRunningSessions: 'limited' }
    screenLines.byTab['tab-2'] = [
      "You've hit your weekly limit · resets Nov 21 at 12pm",
      ' What do you want to do?',
      ' ❯ 1. Stop and wait for limit to reset',
      '   3. Switch to usage credits'
    ]
    vi.mocked(findClaudeSwitchSessions).mockResolvedValue(
      scan([uuidCandidate(1, LEAF_1), uuidCandidate(2, LEAF_2)])
    )

    await handleRunningClaudeSessionsAfterSwitch(SWITCH)

    expect(store.queuePaneAccountRestarts).toHaveBeenLastCalledWith(['pty-2'], 'claude')
  })

  it('restarts only sessions stopped at their usage limit when the setting says so', async () => {
    store.settings = { claudeAccountSwitchRunningSessions: 'limited' }
    store.agentStatusByPaneKey = {
      [`tab-1:${LEAF_1}`]: {
        state: 'done',
        mainAgent: {
          state: 'done',
          outcome: 'failure',
          failureKind: 'usage-limit'
        }
      },
      [`tab-2:${LEAF_2}`]: { state: 'working' }
    }
    vi.mocked(findClaudeSwitchSessions).mockResolvedValue(
      scan([uuidCandidate(1, LEAF_1), uuidCandidate(2, LEAF_2)])
    )

    expect(await handleRunningClaudeSessionsAfterSwitch(SWITCH)).toBe('handled')
    expect(getClaudeAccountSwitchPrompt()).toBeNull()
    expect(store.queuePaneAccountRestarts).toHaveBeenLastCalledWith(['pty-1'], 'claude')
    expect(toastLoading).toHaveBeenCalledWith(
      'Restarting 1 Claude session on account-b@example.com',
      expect.anything()
    )
  })

  it('leaves working sessions alone and asks nothing when none hit the limit', async () => {
    store.settings = { claudeAccountSwitchRunningSessions: 'limited' }
    vi.mocked(findClaudeSwitchSessions).mockResolvedValue(scan([uuidCandidate(1, LEAF_1)]))

    expect(await handleRunningClaudeSessionsAfterSwitch(SWITCH)).toBe('handled')
    expect(getClaudeAccountSwitchPrompt()).toBeNull()
    expect(store.queuePaneAccountRestarts).not.toHaveBeenCalled()
    expect(toastLoading).not.toHaveBeenCalled()
  })

  it('names sessions an automatic restart left behind, and reviews only those', async () => {
    store.settings = { claudeAccountSwitchRunningSessions: 'restart' }
    vi.mocked(findClaudeSwitchSessions).mockResolvedValue(
      scan([candidate(1)], {
        elsewhere: [{ ...candidate(2), accountId: null }],
        cantMove: [{ ...candidate(3), reason: 'own-folder' }]
      })
    )

    store.tabsByWorktree = { 'wt-1': [{ id: 'tab-3', title: 'zsh', customTitle: '[SENSE] 홈' }] }

    await handleRunningClaudeSessionsAfterSwitch(SWITCH)
    expect(store.queuePaneAccountRestarts).toHaveBeenLastCalledWith(['pty-1', 'pty-2'], 'claude')
    const [, options] = toastLoading.mock.lastCall!
    expect(options.description).toBe(
      "1 other session wasn't moved. [SENSE] 홈 (Uses your own Claude folder)"
    )
    expect(options.cancel).toBeUndefined()
    options.action.onClick()

    expect(getClaudeAccountSwitchPrompt()).toMatchObject({
      review: true,
      sessions: {
        onAccount: [],
        elsewhere: [],
        cantMove: [expect.objectContaining({ ptyId: 'pty-3' })]
      }
    })
  })

  it('keeps sessions without scanning when the setting is Never restart', async () => {
    store.settings = { claudeAccountSwitchRunningSessions: 'keep' }
    vi.mocked(findQueuedClaudeRestartsOnAccount).mockReturnValueOnce(['pty-home'])

    expect(await handleRunningClaudeSessionsAfterSwitch(SWITCH)).toBe('show-confirmation')
    expect(findClaudeSwitchSessions).not.toHaveBeenCalled()
    expect(store.consumePendingPaneAccountRestart).toHaveBeenCalledWith('pty-home')
    expect(getClaudeAccountSwitchPrompt()).toBeNull()
    expect(store.queuePaneAccountRestarts).not.toHaveBeenCalled()
  })

  it('applies Never restart chosen while the scan runs', async () => {
    vi.mocked(findClaudeSwitchSessions).mockImplementation(async () => {
      store.settings = { claudeAccountSwitchRunningSessions: 'keep' }
      return scan([candidate(1)])
    })

    expect(await handleRunningClaudeSessionsAfterSwitch(SWITCH)).toBe('show-confirmation')
    expect(getClaudeAccountSwitchPrompt()).toBeNull()
  })

  it('keeps only the newer question when an older scan resolves last', async () => {
    const older = Promise.withResolvers<ClaudeSwitchSessions>()
    const newer = Promise.withResolvers<ClaudeSwitchSessions>()
    vi.mocked(findClaudeSwitchSessions)
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise)
    const first = handleRunningClaudeSessionsAfterSwitch(SWITCH)
    const second = handleRunningClaudeSessionsAfterSwitch({
      ...SWITCH,
      before: SWITCH.after,
      after: SWITCH.before
    })

    newer.resolve(scan([candidate(2)]))
    expect(await second).toBe('handled')
    older.resolve(scan([candidate(1)]))
    expect(await first).toBe('handled')

    expect(getClaudeAccountSwitchPrompt()).toMatchObject({
      sessions: { onAccount: [expect.objectContaining({ ptyId: 'pty-2' })] },
      nextAccountLabel: 'account-a@example.com'
    })
  })
})

describe('switching from a saved account that runs on System default, as the status bar shows it', () => {
  const host: ClaudeRateLimitAccountsState = {
    accounts: [row('account-a', { runsOnSystemDefault: true }), row('account-b')],
    activeAccountId: 'account-a',
    activeAccountIdsByRuntime: { host: 'account-a', wsl: {} }
  }
  const settingsSelecting = (accountId: string | null): GlobalSettings => ({
    ...getDefaultSettings('/tmp'),
    claudeManagedAccounts: [
      { ...row('account-a'), managedAuthPath: '/claude/account-a' },
      { ...row('account-b'), managedAuthPath: '/claude/account-b' }
    ],
    activeClaudeManagedAccountId: accountId,
    activeClaudeManagedAccountIdsByRuntime: { host: accountId, wsl: {} }
  })
  const hostTarget = { runtime: 'host', wslDistro: null } as const
  const before = resolveClaudeStatusAccountState(settingsSelecting('account-a'), host, null)

  beforeEach(() => {
    vi.clearAllMocks()
    resetClaudeAccountSwitchSessionsForTests()
    store.settings = {}
    vi.mocked(findClaudeSwitchSessions).mockResolvedValue(scan([]))
  })

  it('looks for its sessions on System default when switching to another account', async () => {
    const after = {
      ...host,
      activeAccountIdsByRuntime: { host: 'account-b', wsl: {} }
    }

    await handleRunningClaudeSessionsAfterSwitch({
      owner: { kind: 'local' },
      target: hostTarget,
      before: {
        state: before,
        accountId: getClaudeStatusActiveId(before, hostTarget)
      },
      after: {
        state: after,
        accountId: getClaudeStatusActiveId(after, hostTarget)
      }
    })

    expect(findClaudeSwitchSessions).toHaveBeenCalledWith(
      expect.objectContaining({ fromAccountId: null })
    )
  })

  it('moves nothing when switching to System default itself', async () => {
    const after = {
      ...host,
      activeAccountIdsByRuntime: { host: null, wsl: {} }
    }

    expect(
      await handleRunningClaudeSessionsAfterSwitch({
        owner: { kind: 'local' },
        target: hostTarget,
        before: {
          state: before,
          accountId: getClaudeStatusActiveId(before, hostTarget)
        },
        after: {
          state: after,
          accountId: getClaudeStatusActiveId(after, hostTarget)
        }
      })
    ).toBe('show-confirmation')
    expect(findClaudeSwitchSessions).not.toHaveBeenCalled()
  })
})
