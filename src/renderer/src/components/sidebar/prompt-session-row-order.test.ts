import { describe, expect, it } from 'vitest'
import type { Tab, TabGroup } from '../../../../shared/tab-types'
import {
  buildPromptSessionItems,
  buildPromptSessionTabSlots,
  groupPromptAgentRowsByTab,
  isPointInsideRect,
  nextPromptTerminalOrder,
  planPromptSessionReorder
} from './prompt-session-row-order'

const unified = (id: string, groupId: string, contentType: Tab['contentType'] = 'terminal') =>
  ({ id: `u-${id}`, entityId: id, groupId, contentType }) as Tab
const editor = (path: string, groupId: string) =>
  ({ id: path, entityId: path, groupId, contentType: 'editor' }) as Tab
const group = (id: string, tabOrder: string[]) => ({ id, worktreeId: 'wt', tabOrder }) as TabGroup
const row = (paneKey: string, tabId: string, parentPaneKey?: string) => ({
  paneKey,
  tab: { id: tabId },
  entry: parentPaneKey ? { orchestration: { taskId: 't', dispatchId: 'd', parentPaneKey } } : {}
})

describe('buildPromptSessionTabSlots', () => {
  it('maps terminals by entity id and skips editor and browser tabs', () => {
    const slots = buildPromptSessionTabSlots(
      [group('g1', ['u-a', 'README.md', 'u-b'])],
      [unified('a', 'g1'), editor('README.md', 'g1'), unified('b', 'g1')]
    )
    expect(slots.get('a')).toMatchObject({ groupId: 'g1', index: 0, unifiedTabId: 'u-a' })
    expect(slots.get('b')).toMatchObject({ index: 2 })
    expect(slots.has('README.md')).toBe(false)
  })

  it('keeps the first group for a terminal shown in two split groups', () => {
    const slots = buildPromptSessionTabSlots(
      [group('g1', ['u-a']), group('g2', ['u-a'])],
      [unified('a', 'g1')]
    )
    expect(slots.get('a')?.groupId).toBe('g1')
  })
})

describe('groupPromptAgentRowsByTab', () => {
  it('puts split-pane agents of one tab together and a helper with its parent tab', () => {
    const byTab = groupPromptAgentRowsByTab([
      row('a:1', 'a'),
      row('b:1', 'b'),
      row('a:2', 'a'),
      row('c:1', 'c', 'a:1')
    ])
    expect([...byTab.keys()]).toEqual(['a', 'b'])
    expect(byTab.get('a')?.map((r) => r.paneKey)).toEqual(['a:1', 'a:2', 'c:1'])
  })
})

describe('buildPromptSessionItems', () => {
  it('orders by tab group, then tab-bar index, with unlisted terminals last by sort order', () => {
    const slots = buildPromptSessionTabSlots(
      [group('g1', ['u-c', 'u-a']), group('g2', ['u-b'])],
      [unified('a', 'g1'), unified('b', 'g2'), unified('c', 'g1')]
    )
    const items = buildPromptSessionItems({
      agents: [row('a:1', 'a')],
      terminals: [
        { id: 'z', sortOrder: 9 },
        { id: 'a', sortOrder: 0 },
        { id: 'b', sortOrder: 1 },
        { id: 'c', sortOrder: 2 },
        { id: 'y', sortOrder: 3 }
      ],
      slots
    })
    expect(items.map((item) => item.tabId)).toEqual(['c', 'a', 'b', 'y', 'z'])
    expect(items.find((item) => item.tabId === 'a')?.agents).toHaveLength(1)
    expect(items.find((item) => item.tabId === 'c')?.terminal).toMatchObject({ id: 'c' })
    expect(items.map((item) => item.groupKey)).toEqual([
      'group:g1',
      'group:g1',
      'group:g2',
      'ungrouped',
      'ungrouped'
    ])
  })
})

describe('planPromptSessionReorder', () => {
  const groups = [group('g1', ['u-a', 'README.md', 'u-b', 'u-c']), group('g2', ['u-d'])]
  const slots = buildPromptSessionTabSlots(groups, [
    unified('a', 'g1'),
    editor('README.md', 'g1'),
    unified('b', 'g1'),
    unified('c', 'g1'),
    unified('d', 'g2')
  ])
  const orderedTabIds = ['a', 'b', 'c', 'd']

  it('moves the tab and leaves the editor tab in its slot', () => {
    const plan = planPromptSessionReorder({
      orderedTabIds,
      activeTabId: 'c',
      overTabId: 'a',
      slots,
      groups
    })
    expect(plan).toEqual({
      orderedTabIds: ['c', 'a', 'b', 'd'],
      groupId: 'g1',
      tabOrder: ['u-c', 'README.md', 'u-a', 'u-b'],
      movedUnifiedTabId: 'u-c'
    })
  })

  it('moves downward to the target position', () => {
    const plan = planPromptSessionReorder({
      orderedTabIds,
      activeTabId: 'a',
      overTabId: 'b',
      slots,
      groups
    })
    expect(plan?.orderedTabIds).toEqual(['b', 'a', 'c', 'd'])
    expect(plan?.tabOrder).toEqual(['u-b', 'README.md', 'u-a', 'u-c'])
  })

  it('refuses a drop on another tab group, or on itself', () => {
    expect(
      planPromptSessionReorder({ orderedTabIds, activeTabId: 'a', overTabId: 'd', slots, groups })
    ).toBeNull()
    expect(
      planPromptSessionReorder({ orderedTabIds, activeTabId: 'a', overTabId: 'a', slots, groups })
    ).toBeNull()
  })

  it('reorders terminals no tab group lists by sidebar order only', () => {
    const plan = planPromptSessionReorder({
      orderedTabIds: ['x', 'y'],
      activeTabId: 'y',
      overTabId: 'x',
      slots: new Map(),
      groups: []
    })
    expect(plan).toEqual({
      orderedTabIds: ['y', 'x'],
      groupId: null,
      tabOrder: null,
      movedUnifiedTabId: null
    })
  })
})

describe('nextPromptTerminalOrder', () => {
  it('reorders listed terminals in their own places and keeps unlisted ones put', () => {
    expect(nextPromptTerminalOrder(['a', 'helper', 'b', 'c'], ['c', 'a', 'b'])).toEqual([
      'c',
      'helper',
      'a',
      'b'
    ])
  })
})

describe('isPointInsideRect', () => {
  it('tells a drop inside the rows from one outside', () => {
    const rect = { left: 0, right: 100, top: 10, bottom: 50 }
    expect(isPointInsideRect({ x: 50, y: 20 }, rect)).toBe(true)
    expect(isPointInsideRect({ x: 50, y: 60 }, rect)).toBe(false)
  })
})
