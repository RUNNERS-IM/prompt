import { PROMPT_MAIN_WINDOW_KEY as MAIN } from '../../shared/prompt-windows'
import {
  entryId,
  isRecord,
  LIST_FIELDS,
  PANE_KEYED_FIELDS,
  PROMPT_WINDOW_VIEW_FIELDS,
  TAB_KEYED_FIELDS,
  tabIdOfPaneKey,
  VIEW_SCALARS,
  type Entry,
  type PromptWindowView,
  type Session
} from './prompt-session-fields'

/** What a window reads from the shared session, and the tab groups kept whole for main's code. */

// ---- read -------------------------------------------------------------------------------------

function filterGroups(groups: unknown, keep: (tabId: string) => boolean): unknown {
  if (!isRecord(groups)) {
    return groups
  }
  const out: Record<string, unknown> = {}
  for (const [worktreeId, list] of Object.entries(groups)) {
    if (!Array.isArray(list)) {
      continue
    }
    const filtered = list
      .filter(isRecord)
      .map((group) => {
        const order = Array.isArray(group.tabOrder) ? (group.tabOrder as string[]) : []
        const tabOrder = order.filter(keep)
        const recent = Array.isArray(group.recentTabIds) ? (group.recentTabIds as string[]) : []
        const activeTabId =
          typeof group.activeTabId === 'string' && keep(group.activeTabId)
            ? group.activeTabId
            : (tabOrder[0] ?? null)
        return {
          group: { ...group, tabOrder, activeTabId, recentTabIds: recent.filter(keep) },
          emptiedHere: order.length > 0 && tabOrder.length === 0
        }
      })
      .filter(({ emptiedHere }) => !emptiedHere)
      .map(({ group }) => group)
    if (filtered.length > 0) {
      out[worktreeId] = filtered
    }
  }
  return out
}

/**
 * The session a window reads: only its own tabs. `view` is an extra window's own selection
 * (undefined for the main window, which keeps the stored one).
 */
export function promptSessionView<T extends object>(
  storedSession: T,
  windowKey: string,
  ownerOf: (tabId: string) => string,
  view?: PromptWindowView
): T {
  const stored = storedSession as unknown as Session
  if (!isRecord(stored)) {
    return storedSession
  }
  const mine = (tabId: string): boolean => ownerOf(tabId) === windowKey
  const out: Session = { ...stored }
  for (const field of Object.keys(LIST_FIELDS)) {
    const byWorktree = stored[field]
    if (!isRecord(byWorktree)) {
      continue
    }
    const filtered: Record<string, unknown> = {}
    for (const [worktreeId, list] of Object.entries(byWorktree)) {
      if (!Array.isArray(list)) {
        continue
      }
      const kept = list.filter((entry) => {
        const id = entryId(field, entry)
        return id === null ? windowKey === MAIN : mine(id)
      })
      if (kept.length > 0 || list.length === 0) {
        filtered[worktreeId] = kept
      }
    }
    out[field] = filtered
  }
  for (const field of [...TAB_KEYED_FIELDS, ...PANE_KEYED_FIELDS]) {
    const byKey = stored[field]
    if (isRecord(byKey)) {
      const tabOf = TAB_KEYED_FIELDS.has(field) ? (key: string) => key : tabIdOfPaneKey
      out[field] = Object.fromEntries(Object.entries(byKey).filter(([key]) => mine(tabOf(key))))
    }
  }
  if (windowKey !== MAIN) {
    for (const field of PROMPT_WINDOW_VIEW_FIELDS) {
      out[field] = view?.[field] ?? (VIEW_SCALARS.has(field) ? null : {})
    }
  }
  const ownUnifiedIds = new Set(
    Object.values(isRecord(out.unifiedTabs) ? out.unifiedTabs : {})
      .flatMap((list) => (Array.isArray(list) ? list : []))
      .map((tab) => (isRecord(tab) && typeof tab.id === 'string' ? tab.id : null))
      .filter((id): id is string => id !== null)
  )
  // Ids in group tab orders that are not tabs (launch slots) stay; other windows' tabs go.
  out.tabGroups = filterGroups(out.tabGroups, (id) => ownUnifiedIds.has(id) || mine(id))
  return out as unknown as T
}

/**
 * Keeps the stored tab groups whole: every tab of another window sits in one of the main
 * window's stored groups (Orca's main code expects each tab in a group); closed ones leave.
 */
export function promptFixSharedGroups(
  groupsByWorktree: unknown,
  unifiedByWorktree: unknown,
  ownerOf: (tabId: string) => string
): { tabGroups: Record<string, unknown>; unifiedTabs: Record<string, unknown> } {
  const groupsIn = isRecord(groupsByWorktree) ? groupsByWorktree : {}
  const unifiedIn = isRecord(unifiedByWorktree) ? unifiedByWorktree : {}
  const tabGroups: Record<string, unknown> = { ...groupsIn }
  const unifiedTabs: Record<string, unknown> = { ...unifiedIn }
  for (const [worktreeId, list] of Object.entries(unifiedIn)) {
    const tabs = (Array.isArray(list) ? list : []).filter(isRecord)
    const existing = new Set(tabs.map((tab) => tab.id))
    const foreign = (tab: Entry): boolean =>
      ownerOf(String(tab.entityId ?? tab.id)) !== MAIN && typeof tab.id === 'string'
    type Group = Entry & { tabOrder: string[] }
    let groups: Group[] = (
      Array.isArray(groupsIn[worktreeId]) ? (groupsIn[worktreeId] as unknown[]) : []
    )
      .filter(isRecord)
      .map((group): Group => ({
        ...group,
        tabOrder: (Array.isArray(group.tabOrder) ? (group.tabOrder as string[]) : []).filter(
          (id) => existing.has(id) || ownerOf(id) === MAIN
        )
      }))
    const grouped = new Set(groups.flatMap((group) => group.tabOrder))
    const missing = tabs.filter((tab) => foreign(tab) && !grouped.has(tab.id as string))
    if (missing.length > 0) {
      const ids = missing.map((tab) => tab.id as string)
      groups =
        groups.length > 0
          ? groups.map((group, index) =>
              index === 0 ? { ...group, tabOrder: [...group.tabOrder, ...ids] } : group
            )
          : [
              {
                id: `prompt-shared-${worktreeId}`,
                worktreeId,
                activeTabId: ids[0],
                tabOrder: ids,
                recentTabIds: []
              }
            ]
    }
    if (groups.length > 0 || worktreeId in groupsIn) {
      tabGroups[worktreeId] = groups
    }
    const groupOf = new Map<string, string>()
    for (const group of groups) {
      for (const id of group.tabOrder) {
        if (!groupOf.has(id) && typeof group.id === 'string') {
          groupOf.set(id, group.id)
        }
      }
    }
    unifiedTabs[worktreeId] = tabs.map((tab) =>
      foreign(tab) && groupOf.has(tab.id as string) && tab.groupId !== groupOf.get(tab.id as string)
        ? { ...tab, groupId: groupOf.get(tab.id as string) }
        : tab
    )
  }
  return { tabGroups, unifiedTabs }
}
