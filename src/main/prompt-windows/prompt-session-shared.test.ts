import { afterEach, describe, expect, it } from 'vitest'
import type { PromptSessionOwnership } from './prompt-session-fields'
import { promptScopeSessionWrite } from './prompt-session-scope'
import {
  promptSharedScopeWrite,
  promptSharedSessionView,
  resetPromptSessionSharedForTests
} from './prompt-session-shared'
import { isPromptWindowBehind, resetPromptSharedSyncForTests } from './prompt-shared-sync'

const WT = 'repoA::/a'
type Session = Record<string, unknown>

function terminal(id: string, extra: Record<string, unknown> = {}) {
  return { id, worktreeId: WT, title: id, customTitle: null, color: null, ...extra }
}

function unified(id: string, groupId = 'g1') {
  return { id: `u-${id}`, entityId: id, groupId, worktreeId: WT, contentType: 'terminal' }
}

function layout(leaves: string[], ptys: Record<string, string> = {}) {
  const root =
    leaves.length === 1
      ? { type: 'leaf', leafId: leaves[0] }
      : {
          type: 'split',
          direction: 'vertical',
          first: { type: 'leaf', leafId: leaves[0] },
          second: { type: 'leaf', leafId: leaves[1] }
        }
  return { root, activeLeafId: leaves[0], expandedLeafId: null, ptyIdsByLeafId: ptys }
}

function initial(): Session {
  return {
    activeWorktreeId: WT,
    tabsByWorktree: { [WT]: [terminal('t1')] },
    unifiedTabs: {
      [WT]: [
        unified('t1'),
        { id: '/a/x.ts', entityId: '/a/x.ts', groupId: 'g1', contentType: 'editor' }
      ]
    },
    openFilesByWorktree: { [WT]: [{ filePath: '/a/x.ts' }] },
    tabGroups: {
      [WT]: [{ id: 'g1', activeTabId: 'u-t1', tabOrder: ['u-t1', '/a/x.ts'], recentTabIds: [] }]
    },
    terminalLayoutsByTabId: { t1: layout(['l1'], { l1: 'p1' }) }
  }
}

const owners = new Map<string, string>()
function ctx(windowKey: string): PromptSessionOwnership {
  return {
    windowKey,
    ownerOf: (id) => owners.get(id) ?? 'main',
    isPending: () => false,
    claim: (id) => owners.set(id, windowKey),
    seen: () => {}
  }
}

let stored: Session = {}

function read(windowKey: string): Session {
  return promptSharedSessionView(stored, windowKey, null, ctx(windowKey).ownerOf, undefined)
}

function save(windowKey: string, incoming: Session): void {
  const { session } = promptSharedScopeWrite(
    incoming,
    stored,
    ctx(windowKey),
    true,
    null,
    (inc, c) => promptScopeSessionWrite(inc, stored, c, true)
  )
  stored = session
}

function tabIds(session: Session): string[] {
  return ((session.tabsByWorktree as Record<string, { id: string }[]>)[WT] ?? []).map((t) => t.id)
}

describe('prompt shared tabs session', () => {
  afterEach(() => {
    owners.clear()
    resetPromptSessionSharedForTests()
    resetPromptSharedSyncForTests()
  })

  it('shows every window every terminal tab, in one of its groups, and editor tabs to their owner', () => {
    stored = initial()
    read('main')
    const extra = read('w1')
    expect(tabIds(extra)).toEqual(['t1'])
    const unifiedTabs = (extra.unifiedTabs as Record<string, { id: string; groupId: string }[]>)[
      WT
    ]!
    expect(unifiedTabs.map((tab) => tab.id)).toEqual(['u-t1'])
    const groups = (extra.tabGroups as Record<string, { id: string; tabOrder: string[] }[]>)[WT]!
    expect(groups[0]!.tabOrder).toEqual(['u-t1'])
    expect(unifiedTabs[0]!.groupId).toBe(groups[0]!.id)
  })

  it('keeps a tab another window opened that this window has not loaded yet', () => {
    stored = initial()
    const mainView = read('main')
    const extraView = read('w1')
    save('main', {
      ...mainView,
      tabsByWorktree: { [WT]: [terminal('t1'), terminal('t2')] },
      terminalLayoutsByTabId: { t1: layout(['l1'], { l1: 'p1' }), t2: layout(['l1'], { l1: 'p2' }) }
    })
    save('w1', extraView)
    expect(tabIds(stored)).toEqual(['t1', 't2'])
    expect(Object.keys(stored.terminalLayoutsByTabId as object)).toEqual(['t1', 't2'])
  })

  it('does not bring back a tab another window closed, and keeps a change made elsewhere', () => {
    stored = initial()
    stored.tabsByWorktree = { [WT]: [terminal('t1'), terminal('t2')] }
    const mainView = read('main')
    const extraView = read('w1')
    // The extra window renames t1; the main window closes t2.
    save('w1', {
      ...extraView,
      tabsByWorktree: { [WT]: [terminal('t1', { customTitle: 'build' }), terminal('t2')] }
    })
    save('main', { ...mainView, tabsByWorktree: { [WT]: [terminal('t1')] } })
    expect(tabIds(stored)).toEqual(['t1'])
    expect(
      (stored.tabsByWorktree as Record<string, { customTitle: string }[]>)[WT]![0]!.customTitle
    ).toBe('build')
    // The extra window still holds t2 unchanged: it stays closed.
    save('w1', {
      ...extraView,
      tabsByWorktree: { [WT]: [terminal('t1', { customTitle: 'build' }), terminal('t2')] }
    })
    expect(tabIds(stored)).toEqual(['t1'])
  })

  it('lets a window close a tab it had', () => {
    stored = initial()
    stored.tabsByWorktree = { [WT]: [terminal('t1'), terminal('t2')] }
    read('main')
    const extraView = read('w1')
    save('w1', { ...extraView, tabsByWorktree: { [WT]: [terminal('t1')] } })
    expect(tabIds(stored)).toEqual(['t1'])
  })

  it('keeps editor tabs with the window that owns them', () => {
    stored = initial()
    read('main')
    const extraView = read('w1')
    save('w1', extraView)
    expect(stored.openFilesByWorktree).toEqual({ [WT]: [{ filePath: '/a/x.ts' }] })
  })

  it('calls a window behind once a tab another window opened is running', () => {
    stored = initial()
    const mainView = read('main')
    read('w1')
    save('main', {
      ...mainView,
      tabsByWorktree: { [WT]: [terminal('t1'), terminal('t2')] },
      terminalLayoutsByTabId: { t1: layout(['l1'], { l1: 'p1' }), t2: layout(['l1']) }
    })
    // Its shell has not started yet: the other window waits, so it does not start a second one.
    expect(isPromptWindowBehind('w1', true)).toBe(false)
    expect(isPromptWindowBehind('main', true)).toBe(false)
    save('main', {
      ...mainView,
      tabsByWorktree: { [WT]: [terminal('t1'), terminal('t2')] },
      terminalLayoutsByTabId: { t1: layout(['l1'], { l1: 'p1' }), t2: layout(['l1'], { l1: 'p2' }) }
    })
    expect(isPromptWindowBehind('w1', false)).toBe(true)
    read('w1')
    expect(isPromptWindowBehind('w1', true)).toBe(false)
  })

  it('calls a window behind for a split or a rename, and late for a close it did not see', () => {
    stored = initial()
    stored.tabsByWorktree = { [WT]: [terminal('t1'), terminal('t2')] }
    const mainView = read('main')
    read('w1')
    save('main', {
      ...mainView,
      tabsByWorktree: { [WT]: [terminal('t1')] },
      terminalLayoutsByTabId: { t1: layout(['l1', 'l2'], { l1: 'p1', l2: 'p3' }) }
    })
    expect(isPromptWindowBehind('w1', false)).toBe(true)
    read('w1')
    save('main', {
      ...read('main'),
      tabsByWorktree: { [WT]: [terminal('t1', { customTitle: 'x' })] }
    })
    expect(isPromptWindowBehind('w1', false)).toBe(true)

    resetPromptSharedSyncForTests()
    resetPromptSessionSharedForTests()
    stored = initial()
    stored.tabsByWorktree = { [WT]: [terminal('t1'), terminal('t2')] }
    const again = read('main')
    read('w1')
    save('main', { ...again, tabsByWorktree: { [WT]: [terminal('t1')] } })
    expect(isPromptWindowBehind('w1', false)).toBe(false)
    expect(isPromptWindowBehind('w1', true)).toBe(true)
  })
})
