import { describe, expect, it, vi } from 'vitest'
import type * as AgentStatusModule from '@/lib/agent-status'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import {
  createTestStore,
  makeLayout,
  makeTab,
  makeWorktree
} from '../../store/slices/store-test-helpers'
import { createStoreSessionMockApi } from '../../store/slices/store-session-test-harness'

const mocks = vi.hoisted(() => ({ store: null as unknown }))

vi.mock('@/store', () => ({
  get useAppStore() {
    return mocks.store
  }
}))
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/agent-status', async (importOriginal) => {
  const actual = await importOriginal<typeof AgentStatusModule>()
  return { ...actual, detectAgentStatusFromTitle: vi.fn().mockReturnValue(null) }
})

createStoreSessionMockApi()
// Showing the new tab schedules a focus frame; there is no DOM here.
vi.stubGlobal('requestAnimationFrame', () => 0)
vi.stubGlobal('cancelAnimationFrame', () => undefined)

const SESSION = '0f8e2a7c-1b2d-4c3e-9f40-5a6b7c8d9e0f'
const SOURCE = 'repo-1::/src/app'
const SIBLING = 'repo-1::/src/app-feature'
const OTHER = 'repo-2::/src/other'
const REMOTE = 'repo-3::/home/me/remote'
const PANE = 't1:leaf-1'

function repo(id: string, path: string, connectionId: string | null = null) {
  return { id, path, displayName: id, badgeColor: '#000', addedAt: 0, connectionId }
}

function claudeEntry(): AgentStatusEntry {
  return {
    state: 'done',
    prompt: '',
    updatedAt: 2,
    stateStartedAt: 2,
    paneKey: PANE,
    agentType: 'claude',
    stateHistory: [],
    providerSession: { key: 'session_id', id: SESSION }
  }
}

function seededStore() {
  const store = createTestStore()
  store.setState({
    repos: [
      repo('repo-1', '/src/app'),
      repo('repo-2', '/src/other'),
      repo('repo-3', '/home/me/remote', 'ssh-target-1')
    ],
    worktreesByRepo: {
      'repo-1': [
        makeWorktree({ id: SOURCE, repoId: 'repo-1', path: '/src/app' }),
        makeWorktree({ id: SIBLING, repoId: 'repo-1', path: '/src/app-feature' })
      ],
      'repo-2': [makeWorktree({ id: OTHER, repoId: 'repo-2', path: '/src/other' })],
      'repo-3': [makeWorktree({ id: REMOTE, repoId: 'repo-3', path: '/home/me/remote' })]
    },
    activeWorktreeId: SOURCE,
    tabsByWorktree: {
      [SOURCE]: [
        makeTab({ id: 't1', worktreeId: SOURCE, sortOrder: 0 }),
        makeTab({ id: 't2', worktreeId: SOURCE, sortOrder: 1 })
      ]
    },
    terminalLayoutsByTabId: { t1: makeLayout(), t2: makeLayout() },
    agentStatusByPaneKey: { [PANE]: claudeEntry() }
  })
  mocks.store = store
  return store
}

const CLAUDE_PANES = [{ paneKey: PANE, agentType: 'claude' }]

describe('dropping a session row on another workspace', () => {
  it('opens a copy of the Claude session in a new tab there and shows it', async () => {
    const { commitPromptSessionCrossWorkspaceDrop } = await import('./prompt-session-row-drag')
    for (const target of [SIBLING, OTHER]) {
      const store = seededStore()
      const plan = commitPromptSessionCrossWorkspaceDrop({
        tabId: 't1',
        sourceWorktreeId: SOURCE,
        targetWorktreeId: target,
        panes: CLAUDE_PANES
      })
      expect(plan.kind).toBe('fork')
      const state = store.getState()
      const created = state.tabsByWorktree[target] ?? []
      expect(created).toHaveLength(1)
      expect(state.pendingStartupByTabId[created[0]!.id]?.command).toBe(
        `claude --resume ${SESSION} --fork-session`
      )
      expect(state.activeWorktreeId).toBe(target)
      expect(state.activeTabIdByWorktree?.[target]).toBe(created[0]!.id)
      // The original tab keeps running where it was.
      expect(state.tabsByWorktree[SOURCE]?.map((tab) => tab.id)).toEqual(['t1', 't2'])
    }
  })

  it('cancels a drop on a remote workspace, or a pane whose agent left', async () => {
    const { commitPromptSessionCrossWorkspaceDrop } = await import('./prompt-session-row-drag')
    const cases = [
      { targetWorktreeId: REMOTE, panes: CLAUDE_PANES, reason: 'remote' },
      {
        targetWorktreeId: OTHER,
        panes: CLAUDE_PANES,
        reason: 'no-claude-session',
        shellBack: true
      }
    ]
    for (const testCase of cases) {
      const store = seededStore()
      if (testCase.shellBack) {
        store.setState({
          paneForegroundAgentByPaneKey: { [PANE]: { agent: 'claude', shellForeground: true } }
        })
      }
      const before = store.getState()
      expect(
        commitPromptSessionCrossWorkspaceDrop({
          tabId: 't1',
          sourceWorktreeId: SOURCE,
          targetWorktreeId: testCase.targetWorktreeId,
          panes: testCase.panes
        })
      ).toEqual({ kind: 'cancel', reason: testCase.reason })
      const after = store.getState()
      expect(after.tabsByWorktree).toBe(before.tabsByWorktree)
      expect(after.activeWorktreeId).toBe(SOURCE)
    }
  })

  it('leaves a drop on its own workspace to the reorder', async () => {
    const { commitPromptSessionCrossWorkspaceDrop } = await import('./prompt-session-row-drag')
    seededStore()
    expect(
      commitPromptSessionCrossWorkspaceDrop({
        tabId: 't1',
        sourceWorktreeId: SOURCE,
        targetWorktreeId: SOURCE,
        panes: CLAUDE_PANES
      })
    ).toEqual({ kind: 'reorder' })
  })
})
