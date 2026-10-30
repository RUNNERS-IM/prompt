import { describe, expect, it } from 'vitest'
import {
  promptFixSharedGroups,
  promptScopeSessionWrite,
  promptSessionView,
  type PromptSessionOwnership
} from './prompt-session-scope'

const WT = 'repoA::/a'

function stored(): Record<string, unknown> {
  return {
    activeWorktreeId: WT,
    tabsByWorktree: { [WT]: [{ id: 't-main' }, { id: 't-extra' }] },
    unifiedTabs: {
      [WT]: [
        { id: 'u-main', entityId: 't-main', groupId: 'g1' },
        { id: 'u-extra', entityId: 't-extra', groupId: 'g1' }
      ]
    },
    tabGroups: {
      [WT]: [{ id: 'g1', activeTabId: 'u-main', tabOrder: ['u-main', 'u-extra'], recentTabIds: [] }]
    },
    terminalLayoutsByTabId: { 't-main': { a: 1 }, 't-extra': { b: 2 } },
    terminalPtyIncarnationsByPaneKey: { 't-main:l1': 1, 't-extra:l1': 2 }
  }
}

function owners(table: Record<string, string>) {
  const own = new Map(Object.entries(table))
  const pending = new Set<string>()
  const ctx = (windowKey: string): PromptSessionOwnership => ({
    windowKey,
    ownerOf: (id) => own.get(id) ?? 'main',
    isPending: (id) => pending.has(`${windowKey}/${id}`),
    claim: (id) => own.set(id, windowKey),
    seen: (id) => pending.delete(`${windowKey}/${id}`)
  })
  return { own, pending, ctx }
}

describe('prompt session scope', () => {
  it('shows each window only its own tabs, and an extra window its own selection', () => {
    const { ctx } = owners({ 't-extra': 'w1', 'u-extra': 'w1' })
    const mainView = promptSessionView(stored(), 'main', ctx('main').ownerOf)
    expect(mainView.tabsByWorktree).toEqual({ [WT]: [{ id: 't-main' }] })
    expect(mainView.terminalLayoutsByTabId).toEqual({ 't-main': { a: 1 } })
    expect(mainView.terminalPtyIncarnationsByPaneKey).toEqual({ 't-main:l1': 1 })
    expect(mainView.activeWorktreeId).toBe(WT)
    expect(
      (mainView.tabGroups as Record<string, { tabOrder: string[] }[]>)[WT]![0]!.tabOrder
    ).toEqual(['u-main'])

    const extraView = promptSessionView(stored(), 'w1', ctx('w1').ownerOf, {
      activeWorktreeId: WT
    })
    expect(extraView.tabsByWorktree).toEqual({ [WT]: [{ id: 't-extra' }] })
    expect(extraView.unifiedTabs).toEqual({
      [WT]: [{ id: 'u-extra', entityId: 't-extra', groupId: 'g1' }]
    })
    expect(extraView.activeWorktreeId).toBe(WT)
    expect(extraView.tabGroups).toEqual({})
  })

  it('replaces only the saving window part and keeps the other windows tabs', () => {
    const { ctx } = owners({ 't-extra': 'w1' })
    const { session } = promptScopeSessionWrite(
      { tabsByWorktree: { [WT]: [{ id: 't-main', title: 'new' }] }, terminalLayoutsByTabId: {} },
      stored(),
      ctx('main'),
      false
    )
    expect(session.tabsByWorktree).toEqual({
      [WT]: [{ id: 't-main', title: 'new' }, { id: 't-extra' }]
    })
    expect(session.terminalLayoutsByTabId).toEqual({ 't-extra': { b: 2 } })
  })

  it('lets an extra window claim a tab it created and keeps its selection outside the session', () => {
    const { ctx, own } = owners({ 't-extra': 'w1' })
    const { session, view } = promptScopeSessionWrite(
      {
        activeWorktreeId: 'repoB::/b',
        tabsByWorktree: { [WT]: [{ id: 't-extra' }, { id: 't-new' }, { id: 't-main' }] }
      },
      stored(),
      ctx('w1'),
      false
    )
    expect(own.get('t-new')).toBe('w1')
    // t-main belongs to the main window and is already stored: the extra window cannot take it.
    expect(own.get('t-main')).toBeUndefined()
    expect(session.tabsByWorktree).toEqual({
      [WT]: [{ id: 't-extra' }, { id: 't-new' }, { id: 't-main' }]
    })
    expect(view).toEqual({ activeWorktreeId: 'repoB::/b' })
    // The main window selection stays as stored.
    expect(session.activeWorktreeId).toBe(WT)
  })

  it('keeps a tab moved into a window until that window has saved it', () => {
    const { ctx, pending } = owners({ 't-extra': 'main' })
    pending.add('main/t-extra')
    const first = promptScopeSessionWrite(
      { tabsByWorktree: { [WT]: [{ id: 't-main' }] } },
      stored(),
      ctx('main'),
      false
    )
    expect(first.session.tabsByWorktree).toEqual({ [WT]: [{ id: 't-main' }, { id: 't-extra' }] })
    promptScopeSessionWrite(
      { tabsByWorktree: { [WT]: [{ id: 't-main' }, { id: 't-extra' }] } },
      stored(),
      ctx('main'),
      false
    )
    expect(pending.has('main/t-extra')).toBe(false)
  })

  it('puts other windows tabs in a stored group', () => {
    const owner = (id: string) => (id === 't-x' ? 'w1' : 'main')
    const fixed = promptFixSharedGroups(
      { [WT]: [{ id: 'g1', tabOrder: ['u-main'] }] },
      {
        [WT]: [
          { id: 'u-main', entityId: 't-main', groupId: 'g1' },
          { id: 'u-x', entityId: 't-x', groupId: 'gone' }
        ]
      },
      owner
    )
    expect((fixed.tabGroups[WT] as { tabOrder: string[] }[])[0]!.tabOrder).toEqual([
      'u-main',
      'u-x'
    ])
    expect((fixed.unifiedTabs[WT] as { groupId: string }[])[1]!.groupId).toBe('g1')
  })
})
