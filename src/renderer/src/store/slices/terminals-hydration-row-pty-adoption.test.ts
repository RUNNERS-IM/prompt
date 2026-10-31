import './terminal-hydration-store-test-bootstrap'
import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceSessionState } from '../../../../shared/workspace-session-state-types'
import { getDefaultWorkspaceSession } from '../../../../shared/constants'
import { buildWorkspaceSessionPayload } from '@/lib/workspace-session'
import { createTestStore, makeTab, makeWorktree, seedStore } from './store-test-helpers'

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }))
vi.mock('@/runtime/sync-runtime-graph', () => ({
  scheduleRuntimeGraphSync: vi.fn()
}))
vi.mock('@/components/terminal-pane/pty-dispatcher', () => ({
  registerEagerPtyBuffer: vi.fn(),
  ensurePtyDispatcher: vi.fn()
}))

const OPEN_WT = 'repo1::/wt-open'
const CLOSED_WT = 'repo1::/wt-closed'
const LEAF = '11111111-1111-4111-8111-111111111111'
const LEAF_B = '22222222-2222-4222-8222-222222222222'

function seededStore(): ReturnType<typeof createTestStore> {
  const store = createTestStore()
  seedStore(store, {
    worktreesByRepo: {
      repo1: [
        makeWorktree({ id: OPEN_WT, repoId: 'repo1', path: '/wt-open' }),
        makeWorktree({ id: CLOSED_WT, repoId: 'repo1', path: '/wt-closed' })
      ]
    }
  })
  return store
}

function sessionWith(
  tabs: WorkspaceSessionState['tabsByWorktree'],
  layouts: WorkspaceSessionState['terminalLayoutsByTabId']
): WorkspaceSessionState {
  return {
    ...getDefaultWorkspaceSession(),
    activeRepoId: 'repo1',
    activeWorktreeId: OPEN_WT,
    activeTabId: null,
    // The closed workspace was not open at shutdown, so it is outside the reconnect plan.
    activeWorktreeIdsOnShutdown: [OPEN_WT],
    tabsByWorktree: tabs,
    terminalLayoutsByTabId: layouts
  }
}

const singleLeaf = (leafId = LEAF) => ({
  root: { type: 'leaf' as const, leafId },
  activeLeafId: leafId,
  expandedLeafId: null
})

describe('hydration keeps a single-pane tab’s row PTY id', () => {
  it('copies tab.ptyId onto the only leaf of a tab outside the reconnect plan', () => {
    const store = seededStore()
    store.getState().hydrateWorkspaceSession(
      sessionWith(
        {
          [CLOSED_WT]: [makeTab({ id: 'tab-closed', worktreeId: CLOSED_WT, ptyId: 'old-session' })]
        },
        { 'tab-closed': singleLeaf() }
      )
    )

    const state = store.getState()
    expect(state.pendingReconnectWorktreeIds).not.toContain(CLOSED_WT)
    expect(state.pendingReconnectPtyIdByTabId['tab-closed']).toBeUndefined()
    expect(state.tabsByWorktree[CLOSED_WT]?.[0]?.ptyId).toBeNull()
    expect(state.terminalLayoutsByTabId['tab-closed']?.ptyIdsByLeafId).toEqual({
      [LEAF]: 'old-session'
    })
    // The first save keeps the id, so a later open reattaches instead of starting a new shell.
    expect(
      buildWorkspaceSessionPayload(state).terminalLayoutsByTabId['tab-closed']?.ptyIdsByLeafId
    ).toEqual({ [LEAF]: 'old-session' })
  })

  it('leaves an existing leaf binding alone', () => {
    const store = seededStore()
    store
      .getState()
      .hydrateWorkspaceSession(
        sessionWith(
          { [CLOSED_WT]: [makeTab({ id: 'tab-closed', worktreeId: CLOSED_WT, ptyId: 'row-id' })] },
          { 'tab-closed': { ...singleLeaf(), ptyIdsByLeafId: { [LEAF]: 'leaf-id' } } }
        )
      )
    expect(store.getState().terminalLayoutsByTabId['tab-closed']?.ptyIdsByLeafId).toEqual({
      [LEAF]: 'leaf-id'
    })
  })

  it('does not guess which pane of a split owns the row id', () => {
    const store = seededStore()
    const split = {
      root: {
        type: 'split' as const,
        direction: 'vertical' as const,
        first: { type: 'leaf' as const, leafId: LEAF },
        second: { type: 'leaf' as const, leafId: LEAF_B }
      },
      activeLeafId: LEAF,
      expandedLeafId: null
    }
    store
      .getState()
      .hydrateWorkspaceSession(
        sessionWith(
          { [CLOSED_WT]: [makeTab({ id: 'tab-closed', worktreeId: CLOSED_WT, ptyId: 'row-id' })] },
          { 'tab-closed': split }
        )
      )
    expect(store.getState().terminalLayoutsByTabId['tab-closed']?.ptyIdsByLeafId ?? {}).toEqual({})
  })

  it('does not copy a PTY that another tab’s leaf already owns', () => {
    const store = seededStore()
    store.getState().hydrateWorkspaceSession(
      sessionWith(
        {
          [CLOSED_WT]: [
            makeTab({ id: 'tab-a', worktreeId: CLOSED_WT, ptyId: 'shared' }),
            makeTab({ id: 'tab-b', worktreeId: CLOSED_WT, ptyId: null })
          ]
        },
        {
          'tab-a': singleLeaf(),
          'tab-b': { ...singleLeaf(LEAF_B), ptyIdsByLeafId: { [LEAF_B]: 'shared' } }
        }
      )
    )
    expect(store.getState().terminalLayoutsByTabId['tab-a']?.ptyIdsByLeafId ?? {}).toEqual({})
    expect(store.getState().terminalLayoutsByTabId['tab-b']?.ptyIdsByLeafId).toEqual({
      [LEAF_B]: 'shared'
    })
  })
})

describe('a tab made for a previous-version terminal', () => {
  it('records the session on its leaf and keeps it across the next launch', () => {
    const store = seededStore()
    const sessionId = `${CLOSED_WT}@@previous`
    const tab = store.getState().createTab(CLOSED_WT, undefined, undefined, {
      activate: false,
      recordInteraction: false,
      initialPtyId: sessionId
    })
    const saved = buildWorkspaceSessionPayload(store.getState())
    expect(Object.values(saved.terminalLayoutsByTabId[tab.id]?.ptyIdsByLeafId ?? {})).toEqual([
      sessionId
    ])

    const nextLaunch = seededStore()
    nextLaunch.getState().hydrateWorkspaceSession({ ...saved, activeWorktreeIdsOnShutdown: [] })
    expect(
      Object.values(nextLaunch.getState().terminalLayoutsByTabId[tab.id]?.ptyIdsByLeafId ?? {})
    ).toEqual([sessionId])
    expect(nextLaunch.getState().tabsByWorktree[CLOSED_WT]?.map((row) => row.id)).toEqual([tab.id])
  })
})
