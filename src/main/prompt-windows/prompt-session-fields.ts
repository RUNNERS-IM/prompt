/** Session fields Prompt windows split between windows (see prompt-session-scope.ts). */

export type Session = Record<string, unknown>
export type Entry = Record<string, unknown>

/** Lists of tabs per workspace, and how to read an entry's entity id. */
export const LIST_FIELDS: Record<string, (entry: Entry) => unknown> = {
  tabsByWorktree: (entry) => entry.id,
  unifiedTabs: (entry) => entry.entityId ?? entry.id,
  browserTabsByWorktree: (entry) => entry.id,
  openFilesByWorktree: (entry) => entry.filePath
}

export const TAB_KEYED_FIELDS = new Set([
  'terminalLayoutsByTabId',
  'localOnlyScrollbackByTabId',
  'remoteSessionIdsByTabId',
  'browserPagesByWorkspace',
  'closedTerminalTabTombstonesByTabId'
])

export const PANE_KEYED_FIELDS = new Set([
  'sleepingAgentSessionsByPaneKey',
  'terminalPtyIncarnationsByPaneKey',
  'terminalSurfaceTombstonesByPaneKey',
  'closedTerminalPanesByPaneKey'
])

/** What each window selects for itself: an extra window's copy lives outside the session. */
export const PROMPT_WINDOW_VIEW_FIELDS = [
  'activeRepoId',
  'activeWorkspaceKey',
  'activeWorkspaceExecutionHostId',
  'activeWorktreeId',
  'activeTabId',
  'activeTabIdByWorktree',
  'activeGroupIdByWorktree',
  'activeTabTypeByWorktree',
  'tabGroups',
  'tabGroupLayouts',
  'activeFileIdByWorktree',
  'activeBrowserTabIdByWorktree'
] as const

export const VIEW_FIELDS = new Set<string>(PROMPT_WINDOW_VIEW_FIELDS)
export const VIEW_SCALARS = new Set([
  'activeRepoId',
  'activeWorkspaceKey',
  'activeWorkspaceExecutionHostId',
  'activeWorktreeId',
  'activeTabId'
])

export type PromptWindowView = Partial<Record<(typeof PROMPT_WINDOW_VIEW_FIELDS)[number], unknown>>

export type PromptSessionOwnership = {
  /** The window that reads or saves. */
  windowKey: string
  ownerOf: (tabId: string) => string
  /** A tab moved into this window that it has not saved yet. */
  isPending: (tabId: string) => boolean
  /** The window saved a new tab: it owns it now. */
  claim: (tabId: string) => void
  /** The window saved a tab it owns: it is no longer pending. */
  seen: (tabId: string) => void
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function tabIdOfPaneKey(key: string): string {
  const colon = key.indexOf(':')
  return colon > 0 ? key.slice(0, colon) : key
}

export function entityIds(session: Session | undefined): Set<string> {
  const ids = new Set<string>()
  for (const [field, idOf] of Object.entries(LIST_FIELDS)) {
    const byWorktree = session?.[field]
    if (!isRecord(byWorktree)) {
      continue
    }
    for (const list of Object.values(byWorktree)) {
      for (const entry of Array.isArray(list) ? list : []) {
        const id = isRecord(entry) ? idOf(entry) : undefined
        if (typeof id === 'string') {
          ids.add(id)
        }
      }
    }
  }
  return ids
}

export function entryId(field: string, entry: unknown): string | null {
  const id = isRecord(entry) ? LIST_FIELDS[field]!(entry) : undefined
  return typeof id === 'string' ? id : null
}
