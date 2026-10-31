import {
  buildAgentRowLineageTree,
  type AgentLineageSourceRow
} from '@/components/dashboard/agent-row-lineage-model'
import type { Tab, TabGroup } from '../../../../shared/tab-types'

/**
 * Prompt sidebar session order. The sidebar lists one item per tab, in the same order as the tab
 * bar above the terminal, and dragging an item reorders that tab bar. Everything here is pure so
 * the drag commit and the row rendering share one definition of "where a session sits".
 */

/** Where a session's tab sits in the tab bar: which tab group, and its index in that group. */
export type PromptSessionTabSlot = {
  groupId: string
  groupIndex: number
  index: number
  /** The unified tab id inside `group.tabOrder` (terminals key the sidebar by their entity id). */
  unifiedTabId: string
}

const SESSION_CONTENT_TYPES: ReadonlySet<Tab['contentType']> = new Set([
  'terminal',
  'agent-session'
])

/** Session tab id (terminal id, or structured-session unified id/entity id) → its tab-bar slot. */
export function buildPromptSessionTabSlots(
  groups: readonly TabGroup[] | undefined,
  unifiedTabs: readonly Tab[] | undefined
): Map<string, PromptSessionTabSlot> {
  const slots = new Map<string, PromptSessionTabSlot>()
  const tabsById = new Map((unifiedTabs ?? []).map((tab) => [tab.id, tab]))
  for (const [groupIndex, group] of (groups ?? []).entries()) {
    for (const [index, unifiedTabId] of group.tabOrder.entries()) {
      const tab = tabsById.get(unifiedTabId)
      if (!tab || !SESSION_CONTENT_TYPES.has(tab.contentType)) {
        continue
      }
      const slot = { groupId: group.id, groupIndex, index, unifiedTabId }
      // A terminal shown in two split groups keeps the first group's slot.
      for (const key of [tab.entityId, tab.id]) {
        if (!slots.has(key)) {
          slots.set(key, slot)
        }
      }
    }
  }
  return slots
}

/** Group key used to keep drags inside one tab group; tabs outside every group share one key. */
export function promptSessionGroupKey(slot: PromptSessionTabSlot | undefined): string {
  return slot ? `group:${slot.groupId}` : 'ungrouped'
}

type AgentRowLike = AgentLineageSourceRow & { tab: { id: string } }

/**
 * Split agent rows into one bucket per tab. A helper row whose parent lives in another tab stays
 * with its parent, so a tab moves together with everything drawn under it.
 */
export function groupPromptAgentRowsByTab<T extends AgentRowLike>(
  rows: readonly T[]
): Map<string, T[]> {
  const { rootRows, childrenByParentPaneKey } = buildAgentRowLineageTree(rows)
  const ownerTabByPaneKey = new Map<string, string>()
  for (const root of rootRows) {
    const queue: T[] = [root]
    while (queue.length > 0) {
      const row = queue.shift()!
      if (ownerTabByPaneKey.has(row.paneKey)) {
        continue
      }
      ownerTabByPaneKey.set(row.paneKey, root.tab.id)
      queue.push(...(childrenByParentPaneKey.get(row.paneKey) ?? []))
    }
  }
  const byTab = new Map<string, T[]>()
  for (const row of rows) {
    const tabId = ownerTabByPaneKey.get(row.paneKey) ?? row.tab.id
    const bucket = byTab.get(tabId)
    if (bucket) {
      bucket.push(row)
    } else {
      byTab.set(tabId, [row])
    }
  }
  return byTab
}

export type PromptSessionItem<A, T> = {
  /** Session tab id; also the drag id. */
  tabId: string
  groupKey: string
  /** Agent rows drawn for this tab (null for a plain terminal row). */
  agents: A[] | null
  /** The plain terminal tab (null when the tab shows agent rows). */
  terminal: T | null
}

type TerminalLike = { id: string; sortOrder?: number }

/**
 * One item per tab, ordered like the tab bar: tab group first, then the index inside it. Tabs the
 * tab bar does not list yet fall back to their terminal sort order, after every listed tab.
 */
export function buildPromptSessionItems<A extends AgentRowLike, T extends TerminalLike>(args: {
  agents: readonly A[]
  terminals: readonly T[]
  slots: ReadonlyMap<string, PromptSessionTabSlot>
}): PromptSessionItem<A, T>[] {
  const agentsByTab = groupPromptAgentRowsByTab(args.agents)
  const agentTabIds = new Set(args.agents.map((agent) => agent.tab.id))
  const terminalOrder = new Map(
    args.terminals.map((tab, index) => [tab.id, numberOr(tab.sortOrder, index)])
  )
  const entries: { item: PromptSessionItem<A, T>; fallback: number; seq: number }[] = []
  for (const [tabId, rows] of agentsByTab) {
    entries.push({
      item: { tabId, groupKey: '', agents: rows, terminal: null },
      fallback: terminalOrder.get(tabId) ?? Number.MAX_SAFE_INTEGER,
      seq: entries.length
    })
  }
  for (const tab of args.terminals) {
    // A tab with any agent row (even one drawn under another tab's parent) has no plain row.
    if (agentTabIds.has(tab.id)) {
      continue
    }
    entries.push({
      item: { tabId: tab.id, groupKey: '', agents: null, terminal: tab },
      fallback: terminalOrder.get(tab.id) ?? Number.MAX_SAFE_INTEGER,
      seq: entries.length
    })
  }
  for (const entry of entries) {
    entry.item.groupKey = promptSessionGroupKey(args.slots.get(entry.item.tabId))
  }
  entries.sort((a, b) => {
    const slotA = args.slots.get(a.item.tabId)
    const slotB = args.slots.get(b.item.tabId)
    if (slotA && slotB) {
      return slotA.groupIndex - slotB.groupIndex || slotA.index - slotB.index || a.seq - b.seq
    }
    if (slotA || slotB) {
      return slotA ? -1 : 1
    }
    return a.fallback - b.fallback || a.seq - b.seq
  })
  return entries.map((entry) => entry.item)
}

export type PromptSessionReorderPlan = {
  /** Every session tab id of the workspace, in the new sidebar order. */
  orderedTabIds: string[]
  /** The tab group whose tab bar changes; null when only unlisted terminals moved. */
  groupId: string | null
  /** The group's next `tabOrder` (editor/browser tabs keep their places). */
  tabOrder: string[] | null
  /** Unified id of the dragged tab, for the layout-owner command. */
  movedUnifiedTabId: string | null
}

/** Plan dropping `activeTabId` onto `overTabId`; null when the drop changes nothing or crosses groups. */
export function planPromptSessionReorder(args: {
  orderedTabIds: readonly string[]
  activeTabId: string
  overTabId: string
  slots: ReadonlyMap<string, PromptSessionTabSlot>
  groups: readonly TabGroup[] | undefined
}): PromptSessionReorderPlan | null {
  const { orderedTabIds, activeTabId, overTabId, slots } = args
  if (activeTabId === overTabId) {
    return null
  }
  const activeKey = promptSessionGroupKey(slots.get(activeTabId))
  if (activeKey !== promptSessionGroupKey(slots.get(overTabId))) {
    return null
  }
  const members = orderedTabIds.filter((id) => promptSessionGroupKey(slots.get(id)) === activeKey)
  const from = members.indexOf(activeTabId)
  const to = members.indexOf(overTabId)
  if (from === -1 || to === -1) {
    return null
  }
  const nextMembers = [...members]
  nextMembers.splice(from, 1)
  nextMembers.splice(to, 0, activeTabId)

  const memberSet = new Set(members)
  let cursor = 0
  const nextOrdered = orderedTabIds.map((id) => (memberSet.has(id) ? nextMembers[cursor++] : id))

  const activeSlot = slots.get(activeTabId)
  if (!activeSlot) {
    return { orderedTabIds: nextOrdered, groupId: null, tabOrder: null, movedUnifiedTabId: null }
  }
  const group = args.groups?.find((candidate) => candidate.id === activeSlot.groupId)
  if (!group) {
    return null
  }
  const memberUnifiedIds = new Set(members.map((id) => slots.get(id)!.unifiedTabId))
  const queue = nextMembers.map((id) => slots.get(id)!.unifiedTabId)
  const tabOrder = group.tabOrder.map((id) => (memberUnifiedIds.has(id) ? queue.shift()! : id))
  return {
    orderedTabIds: nextOrdered,
    groupId: group.id,
    tabOrder,
    movedUnifiedTabId: activeSlot.unifiedTabId
  }
}

/**
 * Next terminal order for the whole workspace: terminals the sidebar lists take the new sidebar
 * order in the places they held; terminals it does not list (helpers drawn under another tab) stay put.
 */
export function nextPromptTerminalOrder(
  currentTerminalIds: readonly string[],
  orderedTabIds: readonly string[]
): string[] {
  const current = new Set(currentTerminalIds)
  const listed = orderedTabIds.filter((id) => current.has(id))
  const listedSet = new Set(listed)
  let cursor = 0
  return currentTerminalIds.map((id) => (listedSet.has(id) ? listed[cursor++] : id))
}

/** True when the pointer is inside the rectangle (drops outside the workspace's rows cancel). */
export function isPointInsideRect(
  point: { x: number; y: number },
  rect: { left: number; right: number; top: number; bottom: number }
): boolean {
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  )
}

function numberOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
