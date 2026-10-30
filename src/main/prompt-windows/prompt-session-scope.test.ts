import { describe, expect, it } from 'vitest'
import { scopePromptSessionWrite } from './prompt-session-scope'

const A = 'repoA::/a'
const B = 'repoB::/b'

const stored = {
  activeWorktreeId: A,
  tabsByWorktree: { [A]: [{ id: 'ta' }], [B]: [{ id: 'tb' }] },
  terminalLayoutsByTabId: { ta: { leaf: 1 }, tb: { leaf: 1 } },
  terminalPtyIncarnationsByPaneKey: { 'ta:l1': 'i1', 'tb:l1': 'i1' },
  terminalTopologyRevisionByRepoId: { repoA: 1, repoB: 1 }
}

describe('scopePromptSessionWrite', () => {
  it('leaves saves alone when no project window is open', () => {
    const incoming = { ...stored, activeWorktreeId: B }
    expect(scopePromptSessionWrite(incoming, stored, null, new Set(), true)).toBe(incoming)
  })

  it('takes only its own project from a project window and keeps the shared scalars', () => {
    const incoming = {
      activeWorktreeId: B,
      tabsByWorktree: { [B]: [{ id: 'tb' }, { id: 'tb2' }] },
      terminalLayoutsByTabId: { tb: { leaf: 2 }, tb2: { leaf: 1 } },
      terminalPtyIncarnationsByPaneKey: { 'tb2:l1': 'i2' },
      terminalTopologyRevisionByRepoId: { repoB: 2 }
    }
    const result = scopePromptSessionWrite(incoming, stored, 'repoB', new Set(['repoB']), true)
    expect(result.activeWorktreeId).toBe(A)
    expect(result.tabsByWorktree).toEqual({
      [A]: [{ id: 'ta' }],
      [B]: [{ id: 'tb' }, { id: 'tb2' }]
    })
    expect(result.terminalLayoutsByTabId).toEqual({
      ta: { leaf: 1 },
      tb: { leaf: 2 },
      tb2: { leaf: 1 }
    })
    expect(result.terminalPtyIncarnationsByPaneKey).toEqual({ 'ta:l1': 'i1', 'tb2:l1': 'i2' })
    expect(result.terminalTopologyRevisionByRepoId).toEqual({ repoA: 1, repoB: 2 })
  })

  it('keeps the stored records of a project another window owns when the main window saves', () => {
    const incoming = {
      activeWorktreeId: A,
      tabsByWorktree: { [A]: [{ id: 'ta' }, { id: 'ta2' }], [B]: [] },
      terminalLayoutsByTabId: { ta: { leaf: 1 }, ta2: { leaf: 1 } }
    }
    const result = scopePromptSessionWrite(incoming, stored, null, new Set(['repoB']), true)
    expect(result.tabsByWorktree).toEqual({
      [A]: [{ id: 'ta' }, { id: 'ta2' }],
      [B]: [{ id: 'tb' }]
    })
    expect(result.terminalLayoutsByTabId).toEqual({
      ta: { leaf: 1 },
      ta2: { leaf: 1 },
      tb: { leaf: 1 }
    })
    expect((result as Record<string, unknown>).terminalPtyIncarnationsByPaneKey).toEqual({
      'tb:l1': 'i1'
    })
  })

  it('patches only the keys a project window sent', () => {
    const patch = { tabsByWorktree: { [B]: [{ id: 'tb' }], [A]: [] } }
    const result = scopePromptSessionWrite(patch, stored, 'repoB', new Set(['repoB']), false)
    expect(Object.keys(result)).toEqual(['tabsByWorktree'])
    expect(result.tabsByWorktree).toEqual({ [A]: [{ id: 'ta' }], [B]: [{ id: 'tb' }] })
  })
})
