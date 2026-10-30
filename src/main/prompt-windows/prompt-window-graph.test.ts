import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  registerPromptExtraWindow,
  resetPromptWindowRegistryForTests,
  setPromptTabOwner
} from './prompt-window-registry'
import { promptSyncWindowGraph, resetPromptWindowGraphForTests } from './prompt-window-graph'

type Graph = Parameters<typeof promptSyncWindowGraph>[2]

function graph(tabIds: string[]): Graph {
  return {
    tabs: tabIds.map((tabId) => ({ tabId })),
    leaves: tabIds.map((tabId) => ({ tabId, leafId: `${tabId}-leaf` }))
  } as unknown as Graph
}

describe('prompt window graph', () => {
  afterEach(() => {
    resetPromptWindowRegistryForTests()
    resetPromptWindowGraphForTests()
  })

  it('publishes the union of every window under the main window', () => {
    const extra = { id: 2, isDestroyed: () => false, send: () => {} }
    registerPromptExtraWindow('w1', extra)
    setPromptTabOwner('b', 'w1')
    const publish = vi.fn(() => ({}) as never)
    const status = vi.fn(() => ({}) as never)

    // An extra window before the main window published: nothing to merge into yet.
    promptSyncWindowGraph(extra, 20, graph(['b']), publish, status)
    expect(publish).not.toHaveBeenCalled()

    promptSyncWindowGraph({ id: 1 }, 10, graph(['a', 'b']), publish, status)
    const [windowId, merged] = publish.mock.calls.at(-1) as unknown as [number, Graph]
    expect(windowId).toBe(10)
    // The main window still listed b (it handed it over); only w1 counts for it.
    expect(merged.tabs.map((t) => t.tabId)).toEqual(['a', 'b'])
    expect(merged.leaves).toHaveLength(2)

    promptSyncWindowGraph(extra, 20, graph(['b', 'c']), publish, status)
    setPromptTabOwner('c', 'w1')
    promptSyncWindowGraph(extra, 20, graph(['b', 'c']), publish, status)
    const [lastId, last] = publish.mock.calls.at(-1) as unknown as [number, Graph]
    expect(lastId).toBe(10)
    expect(last.tabs.map((t) => t.tabId)).toEqual(['a', 'b', 'c'])
  })
})
