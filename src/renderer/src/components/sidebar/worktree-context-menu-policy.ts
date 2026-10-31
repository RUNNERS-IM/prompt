import type { AppState } from '@/store/types'
import type { Repo } from '../../../../shared/repo-types'
import type {
  WorkspaceStatus,
  WorkspaceStatusDefinition,
  Worktree
} from '../../../../shared/worktree/types'
import { getProjectedWorktreeLineage } from '../../../../shared/sidebar-list/worktree-lineage-projection'
import { getWorkspaceStatus } from './workspace-status'
import { translate } from '@/i18n/i18n'
import { worktreeWorkspaceKey } from '../../../../shared/workspace-scope'
import { parseAgentStatusPaneIdentity } from '../../../../shared/agent-status-worktree-attribution'
import { promptClaudeSessionCopyCommand } from '../../../../shared/prompt-windows'
import { resolveRowAgentType } from './worktree-agent-row-type'

export const WORKTREE_CONTEXT_MENU_SCOPE_ATTR = 'data-worktree-context-menu-scope'
export const WORKTREE_NATIVE_CONTEXT_MENU_ATTR = 'data-worktree-native-context-menu'
const CONTEXT_MENU_CLICK_SUPPRESSION_MS = 500
const DELETE_POSITION_RESTORE_MAX_FRAMES = 180
const DELETE_POSITION_RESTORE_STABLE_FRAMES = 6
// Keep the closing picker mounted through its PopoverContent exit animation.
export const PARENT_PICKER_EXIT_ANIMATION_MS = 200

// Closed menus reuse empty identities so teardown map churn cannot wake their subscriptions.
export const EMPTY_TABS_BY_WORKTREE: AppState['tabsByWorktree'] = {}
export const EMPTY_PTY_IDS_BY_TAB_ID: AppState['ptyIdsByTabId'] = {}
export const EMPTY_BROWSER_TABS_BY_WORKTREE: AppState['browserTabsByWorktree'] = {}
export const EMPTY_UNIFIED_TABS_BY_WORKTREE: AppState['unifiedTabsByWorktree'] = {}
export const EMPTY_AGENT_STATUS_BY_PANE_KEY: AppState['agentStatusByPaneKey'] = {}
export const EMPTY_STRUCTURED_CHAT_SLEPT_AT: AppState['structuredChatSleptAtByPaneKey'] = {}
export const EMPTY_DELETE_STATE_BY_WORKTREE_ID: AppState['deleteStateByWorktreeId'] = {}
export const EMPTY_WORKTREE_LINEAGE_BY_ID: AppState['worktreeLineageById'] = {}
export const EMPTY_WORKSPACE_LINEAGE_BY_CHILD_KEY: AppState['workspaceLineageByChildKey'] = {}
export const EMPTY_CYCLIC_LINEAGE_IDS: ReadonlySet<string> = new Set()
export const EMPTY_WORKTREES: readonly Worktree[] = []
export const EMPTY_WORKTREE_MAP: ReadonlyMap<string, Worktree> = new Map()
export const EMPTY_REPO_MAP: ReadonlyMap<string, Repo> = new Map()

// Return the shared empty reference while closed; open menus read current maps.
export function selectMenuScopedMap<T>(menuOpen: boolean, live: T, empty: T): T {
  return menuOpen ? live : empty
}

// Reveal Developer on Option/Alt at right-click; altKey works across macOS, Windows and Linux.
export function shouldRevealWorktreeDeveloperMenu(args: {
  developerMenuRevealed: boolean
  isMultiContext: boolean
}): boolean {
  return args.developerMenuRevealed && !args.isMultiContext
}

export function hasWorktreeParentLink(
  worktree: Worktree,
  lineageById: AppState['worktreeLineageById'],
  workspaceLineageByChildKey: AppState['workspaceLineageByChildKey']
): boolean {
  return Boolean(
    getProjectedWorktreeLineage(worktree, lineageById) ||
    workspaceLineageByChildKey[worktreeWorkspaceKey(worktree.id)]
  )
}

export function shouldUseNativeContextMenu(target: EventTarget | null): boolean {
  const maybeElement = target as {
    closest?: (selector: string) => Element | null
    parentElement?: { closest?: (selector: string) => Element | null }
  } | null
  const nativeContextMenuSelector = `[${WORKTREE_NATIVE_CONTEXT_MENU_ATTR}]`
  return (
    (maybeElement?.closest?.(nativeContextMenuSelector) ??
      maybeElement?.parentElement?.closest?.(nativeContextMenuSelector)) != null
  )
}

export function shouldIgnoreNestedWorktreeContextMenuScope(
  currentTarget: EventTarget,
  target: EventTarget | null
): boolean {
  const maybeScopedTarget = target as {
    closest?: (selector: string) => Element | null
    parentElement?: { closest?: (selector: string) => Element | null }
  } | null
  const scopeSelector = `[${WORKTREE_CONTEXT_MENU_SCOPE_ATTR}]`
  const closestScope =
    maybeScopedTarget?.closest?.(scopeSelector) ??
    maybeScopedTarget?.parentElement?.closest?.(scopeSelector)
  // Nested lineage previews own context menus even though they sit inside the parent DOM.
  return closestScope != null && closestScope !== currentTarget
}

// Agent rows (full and compact) and Prompt terminal rows all carry one of these classes.
const SESSION_ROW_SELECTOR = '.agent-disclosure-row, .compact-agent-row'

/**
 * True when a right-click landed on a session row. Such a click often means "this one session",
 * so the workspace menu it falls back to (helper rows, closed sessions kept for history) must not
 * offer removing the whole project; that stays on the project header.
 */
export function isSessionRowContextMenuTarget(target: EventTarget | null): boolean {
  const maybeElement = target as {
    closest?: (selector: string) => Element | null
    parentElement?: { closest?: (selector: string) => Element | null }
  } | null
  return (
    (maybeElement?.closest?.(SESSION_ROW_SELECTOR) ??
      maybeElement?.parentElement?.closest?.(SESSION_ROW_SELECTOR)) != null
  )
}

export type WorktreeDuplicateSessionState = Pick<
  AppState,
  | 'activeWorktreeId'
  | 'activeTabId'
  | 'activeTabIdByWorktree'
  | 'tabsByWorktree'
  | 'terminalLayoutsByTabId'
  | 'agentStatusByPaneKey'
>

/**
 * Command behind the workspace menu's "Duplicate" ([PROMPT] decision 1B): the same copy the
 * session row menu offers, for the workspace's active tab (its first tab when none is active).
 * Null when that tab has no known Claude session id, such as a plain shell tab.
 */
export function getWorktreeDuplicateSessionCommand(
  state: WorktreeDuplicateSessionState,
  worktreeId: string
): string | null {
  const tabs = state.tabsByWorktree?.[worktreeId] ?? []
  const activeTabIds = [
    state.activeWorktreeId === worktreeId ? state.activeTabId : null,
    state.activeTabIdByWorktree?.[worktreeId] ?? null
  ]
  const tab =
    activeTabIds
      .map((tabId) => (tabId ? tabs.find((item) => item.id === tabId) : undefined))
      .find((item) => item !== undefined) ?? tabs[0]
  if (!tab) {
    return null
  }
  const activeLeafId = state.terminalLayoutsByTabId?.[tab.id]?.activeLeafId
  const activePaneKey = activeLeafId ? `${tab.id}:${activeLeafId}` : null
  const entries = Object.entries(state.agentStatusByPaneKey ?? {})
    .filter(([paneKey]) => parseAgentStatusPaneIdentity(paneKey)?.tabId === tab.id)
    // A split tab can hold several agents; the focused pane wins.
    .sort(([a], [b]) => Number(b === activePaneKey) - Number(a === activePaneKey))
  for (const [, entry] of entries) {
    const session = entry.providerSession
    if (resolveRowAgentType(entry, tab) === 'claude' && session?.key === 'session_id') {
      const command = promptClaudeSessionCopyCommand(session.id)
      if (command) {
        return command
      }
    }
  }
  return null
}

export function shouldSuppressContextMenuFollowUpClick(
  contextMenuOpenedAt: number,
  now: number
): boolean {
  return (
    now - contextMenuOpenedAt >= 0 && now - contextMenuOpenedAt <= CONTEXT_MENU_CLICK_SUPPRESSION_MS
  )
}

export function getWorktreeParentPickerLabel(validParentWorktreeId: string | null): string {
  return validParentWorktreeId
    ? translate(
        'auto.components.sidebar.WorktreeContextMenu.changeParentWorkspace',
        'Change Parent Worktree...'
      )
    : translate(
        'auto.components.sidebar.WorktreeContextMenu.setParentWorkspace',
        'Set Parent Worktree...'
      )
}

export function isWorktreeParentPickerDisabled(args: {
  isDeleting: boolean
  eligibleParentCount: number
}): boolean {
  return args.isDeleting || args.eligibleParentCount === 0
}

export function getWorktreeParentPickerAnchor(
  scope: HTMLElement | null,
  worktreeId: string
): HTMLElement | null {
  const dragRow = scope?.closest<HTMLElement>('[data-worktree-drag-id]')
  if (dragRow?.dataset.worktreeDragId === worktreeId) {
    return dragRow
  }
  return scope
}

export function shouldRemoveProjectFromContextMenu(
  repo: Pick<Repo, 'id'> | null | undefined,
  worktree: Pick<Worktree, 'isMainWorktree'>
): boolean {
  return repo != null && worktree.isMainWorktree
}

export function isContextWorktreeDeletable(
  worktree: Pick<Worktree, 'isMainWorktree'>,
  repo: Pick<Repo, 'kind'> | null | undefined
): boolean {
  return repo != null && !worktree.isMainWorktree
}

function findSidebarVirtualRowByKey(sidebar: Element, rowKey: string): HTMLElement | null {
  return (
    Array.from(sidebar.querySelectorAll<HTMLElement>('[data-worktree-virtual-row]')).find(
      (element) => element.getAttribute('data-worktree-virtual-row-key') === rowKey
    ) ?? null
  )
}

export function shouldContinueDeleteSiblingPositionRestore(args: {
  attempts: number
  stableFrames: number
}): boolean {
  // Stop restoring once position settles so user scrolling wins during slow deletes.
  return (
    args.attempts < DELETE_POSITION_RESTORE_MAX_FRAMES &&
    args.stableFrames < DELETE_POSITION_RESTORE_STABLE_FRAMES
  )
}

export function preserveDeleteSiblingPosition(scope: HTMLElement | null): () => void {
  const sidebar = scope?.closest('[data-worktree-sidebar]')
  const row = scope?.closest('[data-worktree-virtual-row]')
  if (!(sidebar instanceof HTMLElement) || !(row instanceof HTMLElement)) {
    return () => {}
  }
  const rows = Array.from(sidebar.querySelectorAll<HTMLElement>('[data-worktree-virtual-row]'))
    .map((element) => ({ element, top: element.getBoundingClientRect().top }))
    .sort((a, b) => a.top - b.top)
    .map(({ element }) => element)
  const rowIndex = rows.indexOf(row)
  const anchorRow = rows[rowIndex + 1] ?? rows[rowIndex - 1] ?? null
  const anchorKey = anchorRow?.getAttribute('data-worktree-virtual-row-key')
  const rowKey = row.getAttribute('data-worktree-virtual-row-key')
  if (!anchorKey || !rowKey) {
    return () => {}
  }
  const previousScrollTop = sidebar.scrollTop
  const previousScrollHeight = sidebar.scrollHeight
  const desiredTop = row.getBoundingClientRect().top

  return () => {
    let attempts = 0
    let stableFrames = 0
    const restore = (): void => {
      const currentSidebar = document.querySelector('[data-worktree-sidebar]')
      if (!(currentSidebar instanceof HTMLElement)) {
        return
      }
      const currentTarget = findSidebarVirtualRowByKey(currentSidebar, rowKey)
      const currentAnchor = currentTarget ?? findSidebarVirtualRowByKey(currentSidebar, anchorKey)
      if (currentAnchor) {
        const delta = currentAnchor.getBoundingClientRect().top - desiredTop
        if (Math.abs(delta) > 1) {
          currentSidebar.scrollTop += delta
          stableFrames = 0
        } else {
          stableFrames += 1
        }
      } else {
        currentSidebar.scrollTop = Math.max(
          0,
          previousScrollTop + currentSidebar.scrollHeight - previousScrollHeight
        )
        stableFrames = 0
      }
      attempts += 1
      if (
        shouldContinueDeleteSiblingPositionRestore({
          attempts,
          stableFrames
        })
      ) {
        window.requestAnimationFrame(restore)
      }
    }
    restore()
  }
}

/** The status every context worktree shares, or '' when they differ or there are none. */
export function getSharedWorkspaceStatus(
  worktrees: readonly Worktree[],
  statusesFor: (worktree: Worktree) => readonly WorkspaceStatusDefinition[]
): WorkspaceStatus {
  const [first, ...rest] = worktrees
  if (!first) {
    return ''
  }
  const status = getWorkspaceStatus(first, statusesFor(first))
  return rest.every((item) => getWorkspaceStatus(item, statusesFor(item)) === status) ? status : ''
}

export type WorkspaceStatusAssignmentPlan =
  | { readonly kind: 'board-sync'; readonly worktreeIds: readonly string[] }
  | { readonly kind: 'local-only'; readonly localWriteIds: readonly string[] }

// Board callbacks own local-first/provider sync; otherwise write only changed statuses locally.
export function planWorkspaceStatusAssignment(
  worktrees: readonly Worktree[],
  status: WorkspaceStatus,
  statusesFor: (worktree: Worktree) => readonly WorkspaceStatusDefinition[],
  boardSyncEnabled: boolean
): WorkspaceStatusAssignmentPlan {
  if (boardSyncEnabled) {
    return { kind: 'board-sync', worktreeIds: worktrees.map((item) => item.id) }
  }
  const localWriteIds = worktrees
    .filter((item) => getWorkspaceStatus(item, statusesFor(item)) !== status)
    .map((item) => item.id)
  return { kind: 'local-only', localWriteIds }
}
