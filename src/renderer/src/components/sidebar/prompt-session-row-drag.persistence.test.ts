import { describe, expect, it, vi } from 'vitest'
import type * as AgentStatusModule from '@/lib/agent-status'
import { buildWorkspaceSessionPayload } from '@/lib/workspace-session'
import { reconcileHydratedWorkspaceTabModels } from '../../app-shell/reconcile-hydrated-workspace-tab-models'
import {
  createTestStore,
  makeLayout,
  makeTab,
  makeTabGroup,
  makeUnifiedTab,
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

const WT = 'repo-1::/src/app'
const REPO = { id: 'repo-1', path: '/src/app', displayName: 'app', badgeColor: '#000', addedAt: 0 }

function seededStore() {
  const store = createTestStore()
  store.setState({
    repos: [REPO],
    worktreesByRepo: { 'repo-1': [makeWorktree({ id: WT, repoId: 'repo-1', path: '/src/app' })] }
  })
  return store
}

describe('a sidebar session drag survives a restart', () => {
  it('saves the new tab-bar and terminal order and restores it', async () => {
    const store = seededStore()
    mocks.store = store
    const ids = ['t1', 't2', 't3']
    store.setState({
      activeWorktreeId: WT,
      tabsByWorktree: {
        [WT]: ids.map((id, sortOrder) => makeTab({ id, worktreeId: WT, sortOrder }))
      },
      terminalLayoutsByTabId: Object.fromEntries(ids.map((id) => [id, makeLayout()])),
      unifiedTabsByWorktree: {
        [WT]: ids.map((id, sortOrder) =>
          makeUnifiedTab({ id: `u-${id}`, entityId: id, worktreeId: WT, groupId: 'g1', sortOrder })
        )
      },
      groupsByWorktree: {
        [WT]: [
          makeTabGroup({
            id: 'g1',
            worktreeId: WT,
            activeTabId: 'u-t1',
            tabOrder: ['u-t1', 'u-t2', 'u-t3']
          })
        ]
      },
      layoutByWorktree: { [WT]: { type: 'leaf', groupId: 'g1' } },
      activeGroupIdByWorktree: { [WT]: 'g1' }
    })

    const { commitPromptSessionReorder } = await import('./prompt-session-row-drag')
    expect(
      commitPromptSessionReorder({
        worktreeId: WT,
        orderedTabIds: ids,
        activeTabId: 't3',
        overTabId: 't1'
      })
    ).toBe(true)

    const saved = structuredClone(buildWorkspaceSessionPayload(store.getState()))
    const restored = seededStore()
    restored.getState().hydrateWorkspaceSession(structuredClone(saved), {})
    restored.getState().hydrateTabsSession(structuredClone(saved), {})
    reconcileHydratedWorkspaceTabModels(saved, restored.getState().reconcileWorktreeTabModels)

    const state = restored.getState()
    expect(state.groupsByWorktree[WT]?.map((group) => group.tabOrder)).toEqual([
      ['u-t3', 'u-t1', 'u-t2']
    ])
    expect(state.tabsByWorktree[WT]?.map((tab) => tab.id)).toEqual(['t3', 't1', 't2'])
  })
})
