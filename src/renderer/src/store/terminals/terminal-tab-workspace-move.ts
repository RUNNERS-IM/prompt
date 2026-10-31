import type { Tab, TabGroup } from '../../../../shared/tab-types'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import { collapseGroupLayout } from '../../../../shared/workspace-layout/tab-group-layout-tree'
import { dedupeTabOrder } from '../../../../shared/workspace-layout/tab-order'
import type { AppState } from '../types'
import {
  ensureGroup,
  pickNextActiveTab,
  pushRecentTabId,
  sanitizeRecentTabIds
} from '../slices/tab-group-state'
import { locateTerminalTab } from './terminal-tab-location'

type MoveState = Pick<
  AppState,
  | 'tabsByWorktree'
  | 'activeTabIdByWorktree'
  | 'tabBarOrderByWorktree'
  | 'pendingReconnectTabByWorktree'
  | 'unifiedTabsByWorktree'
  | 'groupsByWorktree'
  | 'activeGroupIdByWorktree'
  | 'layoutByWorktree'
>

export type TerminalTabWorkspaceMovePatch = MoveState

function withoutTab(order: readonly string[] | undefined, tabId: string): string[] {
  return (order ?? []).filter((id) => id !== tabId)
}

/**
 * The tab row as it lands in the target workspace. It keeps its id and its terminals; the terminal
 * ids it carries are listed in `adoptedPtyIds` so ownership checks name the new workspace.
 * `startupCwd` is dropped because it names a folder of the old workspace.
 */
function movedTerminalRow(
  tab: TerminalTab,
  targetWorktreeId: string,
  boundPtyIds: readonly string[],
  sortOrder: number
): TerminalTab {
  const { startupCwd: _startupCwd, ...rest } = tab
  const adopted = [...new Set([...(tab.adoptedPtyIds ?? []), ...boundPtyIds])]
  return { ...rest, worktreeId: targetWorktreeId, sortOrder, adoptedPtyIds: adopted }
}

/** Source side of the tab-group state once the tab leaves `group`. */
function leaveGroup(
  state: MoveState,
  worktreeId: string,
  group: TabGroup,
  unifiedTabId: string
): Pick<MoveState, 'groupsByWorktree' | 'layoutByWorktree' | 'activeGroupIdByWorktree'> {
  const order = dedupeTabOrder(group.tabOrder)
  const remaining = order.filter((id) => id !== unifiedTabId)
  const groups = state.groupsByWorktree[worktreeId] ?? []
  // An emptied group that is not the workspace's only group closes, as when its last tab moves away.
  if (remaining.length === 0 && groups.length > 1) {
    const collapsed = collapseGroupLayout(
      state.layoutByWorktree,
      state.activeGroupIdByWorktree,
      worktreeId,
      group.id,
      groups.find((candidate) => candidate.id !== group.id)?.id ?? null
    )
    return {
      groupsByWorktree: {
        ...state.groupsByWorktree,
        [worktreeId]: groups.filter((candidate) => candidate.id !== group.id)
      },
      layoutByWorktree: collapsed.layoutByWorktree,
      activeGroupIdByWorktree: collapsed.activeGroupIdByWorktree
    }
  }
  const next: TabGroup = {
    ...group,
    tabOrder: remaining,
    activeTabId:
      group.activeTabId === unifiedTabId
        ? pickNextActiveTab(order, group.recentTabIds, unifiedTabId)
        : group.activeTabId,
    recentTabIds: sanitizeRecentTabIds(withoutTab(group.recentTabIds, unifiedTabId), remaining)
  }
  return {
    groupsByWorktree: {
      ...state.groupsByWorktree,
      [worktreeId]: groups.map((candidate) => (candidate.id === group.id ? next : candidate))
    },
    layoutByWorktree: state.layoutByWorktree,
    activeGroupIdByWorktree: state.activeGroupIdByWorktree
  }
}

/**
 * Moves terminal tab `tabId` with its running terminals into `targetWorktreeId`, as the active tab
 * of the target's active group. Only the per-workspace maps change; everything keyed by tab id
 * (layout, pane bindings, scrollback, titles) goes along untouched. Null when the tab or its
 * workspace-tab entry is missing, or it already lives in the target.
 */
export function terminalTabWorkspaceMovePatch(
  state: MoveState,
  tabId: string,
  targetWorktreeId: string,
  boundPtyIds: readonly string[]
): TerminalTabWorkspaceMovePatch | null {
  const located = locateTerminalTab(state.tabsByWorktree, tabId)
  if (!located || located.worktreeId === targetWorktreeId) {
    return null
  }
  const source = located.worktreeId
  const unified = (state.unifiedTabsByWorktree[source] ?? []).find(
    (tab) => tab.contentType === 'terminal' && tab.entityId === tabId
  )
  const sourceGroup = unified
    ? state.groupsByWorktree[source]?.find((group) => group.id === unified.groupId)
    : undefined
  if (!unified || !sourceGroup) {
    return null
  }

  const left = leaveGroup(state, source, sourceGroup, unified.id)
  const ensured = ensureGroup(
    left.groupsByWorktree,
    left.activeGroupIdByWorktree,
    targetWorktreeId,
    left.activeGroupIdByWorktree[targetWorktreeId]
  )
  const targetGroup = ensured.group
  const targetOrder = [...withoutTab(targetGroup.tabOrder, unified.id), unified.id]
  const placedGroup: TabGroup = {
    ...targetGroup,
    tabOrder: targetOrder,
    activeTabId: unified.id,
    recentTabIds: pushRecentTabId(
      sanitizeRecentTabIds(targetGroup.recentTabIds, targetOrder),
      unified.id
    )
  }
  const targetGroups = ensured.groupsByWorktree[targetWorktreeId] ?? []
  const targetUnified = state.unifiedTabsByWorktree[targetWorktreeId] ?? []
  const movedUnified: Tab = {
    ...unified,
    worktreeId: targetWorktreeId,
    groupId: targetGroup.id,
    sortOrder: targetUnified.reduce((max, tab) => Math.max(max, tab.sortOrder + 1), 0)
  }

  const sourceRows = state.tabsByWorktree[source] ?? []
  const targetRows = state.tabsByWorktree[targetWorktreeId] ?? []
  const remainingRows = sourceRows.filter((tab) => tab.id !== tabId)
  const sortOrder = targetRows.reduce((max, tab) => Math.max(max, tab.sortOrder + 1), 0)

  const tabBarOrderByWorktree = { ...state.tabBarOrderByWorktree }
  if (tabBarOrderByWorktree[source]) {
    tabBarOrderByWorktree[source] = withoutTab(tabBarOrderByWorktree[source], tabId)
  }
  if (tabBarOrderByWorktree[targetWorktreeId]) {
    tabBarOrderByWorktree[targetWorktreeId] = [
      ...withoutTab(tabBarOrderByWorktree[targetWorktreeId], tabId),
      tabId
    ]
  }

  let pendingReconnectTabByWorktree = state.pendingReconnectTabByWorktree
  if (pendingReconnectTabByWorktree[source]?.includes(tabId)) {
    pendingReconnectTabByWorktree = {
      ...pendingReconnectTabByWorktree,
      [source]: withoutTab(pendingReconnectTabByWorktree[source], tabId),
      [targetWorktreeId]: [
        ...withoutTab(pendingReconnectTabByWorktree[targetWorktreeId], tabId),
        tabId
      ]
    }
  }

  return {
    tabsByWorktree: {
      ...state.tabsByWorktree,
      [source]: remainingRows,
      [targetWorktreeId]: [
        ...targetRows,
        movedTerminalRow(located.tab, targetWorktreeId, boundPtyIds, sortOrder)
      ]
    },
    activeTabIdByWorktree: {
      ...state.activeTabIdByWorktree,
      ...(state.activeTabIdByWorktree[source] === tabId
        ? { [source]: remainingRows[0]?.id ?? null }
        : {}),
      [targetWorktreeId]: tabId
    },
    tabBarOrderByWorktree,
    pendingReconnectTabByWorktree,
    unifiedTabsByWorktree: {
      ...state.unifiedTabsByWorktree,
      [source]: (state.unifiedTabsByWorktree[source] ?? []).filter((tab) => tab.id !== unified.id),
      [targetWorktreeId]: [...targetUnified, movedUnified]
    },
    groupsByWorktree: {
      ...ensured.groupsByWorktree,
      [targetWorktreeId]: targetGroups.map((group) =>
        group.id === placedGroup.id ? placedGroup : group
      )
    },
    activeGroupIdByWorktree: ensured.activeGroupIdByWorktree,
    layoutByWorktree: {
      ...left.layoutByWorktree,
      [targetWorktreeId]: left.layoutByWorktree[targetWorktreeId] ?? {
        type: 'leaf',
        groupId: targetGroup.id
      }
    }
  }
}
