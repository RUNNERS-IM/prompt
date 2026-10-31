import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PtyRunningWorkVerdict } from '@/components/terminal/pty-running-work-probe'
import type { TerminalLayoutSnapshot } from '../../../shared/terminal-tab-types'
import {
  movedTerminalOwnerOf,
  setMovedTerminalOwnerSession
} from '../../../shared/moved-terminal-owner'
import { isPtySessionIdOwnedByWorktree } from '../../../shared/pty-session-id-format'
import { createTestStore, makeTab, makeWorktree } from '../store/slices/store-test-helpers'
import { createStoreSessionMockApi } from '../store/slices/store-session-test-harness'

const mocks = vi.hoisted(() => ({
  store: null as unknown,
  verdicts: {} as Record<string, PtyRunningWorkVerdict>,
  beforeProbeAnswers: null as (() => void) | null,
  sent: [] as { ptyId: string; data: string }[]
}))

vi.mock('@/store', () => ({
  get useAppStore() {
    return mocks.store
  }
}))
vi.mock('@/components/terminal/pty-running-work-probe', () => ({
  probePtyRunningWork: async (ptyIds: string[]) => {
    mocks.beforeProbeAnswers?.()
    return ptyIds.map((ptyId) => ({
      ptyId,
      verdict: mocks.verdicts[ptyId] ?? 'exited',
      timedOut: false,
      remote: false
    }))
  }
}))
vi.mock('@/runtime/runtime-terminal-inspection', () => ({
  sendRuntimePtyInput: (ptyId: string, data: string) => {
    mocks.sent.push({ ptyId, data })
    return true
  }
}))

createStoreSessionMockApi()
vi.stubGlobal('requestAnimationFrame', () => 0)
vi.stubGlobal('cancelAnimationFrame', () => undefined)

const { moveShellTabToWorkspace, shellChangeDirectoryCommand } =
  await import('./shell-tab-workspace-move')

const SOURCE = 'repo-1::/src/app'
const TARGET = "repo-2::/src/it's here"
const TARGET_PATH = "/src/it's here"
const REMOTE = 'repo-3::/home/me/remote'
const PTY = `${SOURCE}@@a1b2c3d4`
const PTY_B = `${SOURCE}@@a1b2c3d5`

function repo(id: string, path: string, connectionId: string | null = null) {
  return { id, path, displayName: id, badgeColor: '#000', addedAt: 0, connectionId }
}

function singlePane(ptyId: string | null): TerminalLayoutSnapshot {
  return {
    root: { type: 'leaf', leafId: 'leaf-1' },
    activeLeafId: 'leaf-1',
    expandedLeafId: null,
    ...(ptyId ? { ptyIdsByLeafId: { 'leaf-1': ptyId } } : {})
  }
}

function splitPanes(second: string | null): TerminalLayoutSnapshot {
  return {
    root: {
      type: 'split',
      direction: 'vertical',
      first: { type: 'leaf', leafId: 'leaf-1' },
      second: { type: 'leaf', leafId: 'leaf-2' }
    } as TerminalLayoutSnapshot['root'],
    activeLeafId: 'leaf-1',
    expandedLeafId: null,
    ptyIdsByLeafId: { 'leaf-1': PTY, ...(second ? { 'leaf-2': second } : {}) }
  }
}

function unified(id: string, worktreeId: string, groupId: string, sortOrder: number) {
  return {
    id,
    entityId: id,
    groupId,
    worktreeId,
    contentType: 'terminal' as const,
    label: id,
    customLabel: null,
    color: null,
    sortOrder,
    createdAt: 0
  }
}

function seededStore(layout: TerminalLayoutSnapshot = singlePane(PTY)) {
  const store = createTestStore()
  store.setState({
    repos: [
      repo('repo-1', '/src/app'),
      repo('repo-2', TARGET_PATH),
      repo('repo-3', '/home/me/remote', 'ssh-target-1')
    ],
    worktreesByRepo: {
      'repo-1': [makeWorktree({ id: SOURCE, repoId: 'repo-1', path: '/src/app' })],
      'repo-2': [makeWorktree({ id: TARGET, repoId: 'repo-2', path: TARGET_PATH })],
      'repo-3': [makeWorktree({ id: REMOTE, repoId: 'repo-3', path: '/home/me/remote' })]
    },
    activeWorktreeId: SOURCE,
    activeTabId: 't1',
    activeTabIdByWorktree: { [SOURCE]: 't1' },
    tabsByWorktree: {
      [SOURCE]: [
        makeTab({ id: 't1', worktreeId: SOURCE, ptyId: PTY, startupCwd: '/src/app/sub' }),
        makeTab({ id: 't2', worktreeId: SOURCE, sortOrder: 1 })
      ]
    },
    terminalLayoutsByTabId: { t1: layout, t2: singlePane(null) },
    unifiedTabsByWorktree: {
      [SOURCE]: [unified('t1', SOURCE, 'g1', 0), unified('t2', SOURCE, 'g1', 1)]
    },
    groupsByWorktree: {
      [SOURCE]: [
        {
          id: 'g1',
          worktreeId: SOURCE,
          activeTabId: 't1',
          tabOrder: ['t1', 't2'],
          recentTabIds: ['t2', 't1']
        }
      ]
    },
    activeGroupIdByWorktree: { [SOURCE]: 'g1' },
    layoutByWorktree: { [SOURCE]: { type: 'leaf', groupId: 'g1' } }
  })
  mocks.store = store
  setMovedTerminalOwnerSession(() => store.getState())
  return store
}

beforeEach(() => {
  mocks.verdicts = {}
  mocks.beforeProbeAnswers = null
  mocks.sent = []
})
afterEach(() => setMovedTerminalOwnerSession(null))

describe('shellChangeDirectoryCommand', () => {
  it('single-quotes the folder so nothing in it runs as shell syntax', () => {
    expect(shellChangeDirectoryCommand("/a/it's $(x)")).toBe("cd -- '/a/it'\\''s $(x)'")
  })
})

describe('moving an idle shell tab to another workspace', () => {
  it('moves the tab with its running shell and changes the shell folder', async () => {
    const store = seededStore()
    const result = await moveShellTabToWorkspace({
      tabId: 't1',
      targetWorktreeId: TARGET,
      reveal: true
    })
    expect(result).toEqual({ moved: true, tabId: 't1', worktreeId: TARGET })

    const state = store.getState()
    expect(state.tabsByWorktree[SOURCE]?.map((tab) => tab.id)).toEqual(['t2'])
    const moved = state.tabsByWorktree[TARGET]?.[0]
    expect(moved).toMatchObject({ id: 't1', worktreeId: TARGET, ptyId: PTY, adoptedPtyIds: [PTY] })
    expect(moved?.startupCwd).toBeUndefined()
    // The pane keeps the same terminal.
    expect(state.terminalLayoutsByTabId.t1?.ptyIdsByLeafId).toEqual({ 'leaf-1': PTY })
    expect(state.unifiedTabsByWorktree[SOURCE]?.map((tab) => tab.id)).toEqual(['t2'])
    const targetGroup = state.groupsByWorktree[TARGET]?.[0]
    expect(state.unifiedTabsByWorktree[TARGET]?.[0]).toMatchObject({
      id: 't1',
      worktreeId: TARGET,
      groupId: targetGroup?.id
    })
    expect(targetGroup).toMatchObject({ tabOrder: ['t1'], activeTabId: 't1' })
    expect(state.groupsByWorktree[SOURCE]?.[0]).toMatchObject({
      tabOrder: ['t2'],
      activeTabId: 't2'
    })
    expect(state.layoutByWorktree[TARGET]).toEqual({ type: 'leaf', groupId: targetGroup?.id })
    expect(state.activeWorktreeId).toBe(TARGET)

    expect(mocks.sent).toEqual([{ ptyId: PTY, data: "cd -- '/src/it'\\''s here'\r" }])
    // Ownership checks now name the target workspace.
    expect(movedTerminalOwnerOf(PTY)).toBe(TARGET)
    expect(isPtySessionIdOwnedByWorktree(PTY, SOURCE)).toBe(false)
  })

  it('keeps the window on the old workspace when not asked to show the target', async () => {
    const store = seededStore()
    await moveShellTabToWorkspace({ tabId: 't1', targetWorktreeId: TARGET })
    const state = store.getState()
    expect(state.activeWorktreeId).toBe(SOURCE)
    expect(state.activeTabId).toBe('t2')
  })

  it('moves a split tab when every pane is an idle shell', async () => {
    const store = seededStore(splitPanes(PTY_B))
    const result = await moveShellTabToWorkspace({ tabId: 't1', targetWorktreeId: TARGET })
    expect(result.moved).toBe(true)
    expect(store.getState().tabsByWorktree[TARGET]?.[0]?.adoptedPtyIds).toEqual([PTY, PTY_B])
    expect(mocks.sent.map((entry) => entry.ptyId)).toEqual([PTY, PTY_B])
  })
})

describe('refusing to move', () => {
  async function expectRefusal(
    reason: string,
    setup: { layout?: TerminalLayoutSnapshot; target?: string } = {}
  ) {
    const store = seededStore(setup.layout)
    const before = store.getState().tabsByWorktree
    expect(
      await moveShellTabToWorkspace({ tabId: 't1', targetWorktreeId: setup.target ?? TARGET })
    ).toEqual({ moved: false, reason })
    expect(store.getState().tabsByWorktree).toBe(before)
    expect(mocks.sent).toEqual([])
  }

  it('when a program runs in the shell', async () => {
    mocks.verdicts[PTY] = 'live'
    await expectRefusal('running-program')
  })

  it('when a program runs in any pane of a split tab', async () => {
    mocks.verdicts[PTY_B] = 'live'
    await expectRefusal('running-program', { layout: splitPanes(PTY_B) })
  })

  it('when the host cannot tell whether the shell is idle', async () => {
    mocks.verdicts[PTY] = 'unverifiable'
    await expectRefusal('idle-unknown')
  })

  it('when a pane has no running terminal', async () => {
    await expectRefusal('no-running-terminal', { layout: splitPanes(null) })
  })

  it('when the target runs over SSH', async () => {
    await expectRefusal('remote', { target: REMOTE })
  })

  it('when the target is unknown or is the same workspace', async () => {
    await expectRefusal('target-not-found', { target: 'repo-9::/nowhere' })
    await expectRefusal('same-workspace', { target: SOURCE })
  })

  it('when the tab changed while the shell was being checked', async () => {
    const store = seededStore()
    mocks.beforeProbeAnswers = () => {
      store.setState({
        terminalLayoutsByTabId: {
          ...store.getState().terminalLayoutsByTabId,
          t1: singlePane(PTY_B)
        }
      })
    }
    expect(await moveShellTabToWorkspace({ tabId: 't1', targetWorktreeId: TARGET })).toEqual({
      moved: false,
      reason: 'changed'
    })
    expect(store.getState().tabsByWorktree[TARGET]).toBeUndefined()
  })
})
