/**
 * Prompt windows: any number of full Prompt windows (Cmd+N, "Open in New Window" on a project).
 * Each terminal tab is shown by exactly one window. Main keeps a table "tab id -> window key";
 * a tab missing from it belongs to the main window. Moving a tab to another window only changes
 * the table; the receiving window attaches the same live terminal (release C's tab dragging uses
 * the same move).
 */

/** Query parameter on the renderer URL naming an extra window's key (absent: main window). */
export const PROMPT_WINDOW_QUERY = 'promptWindow'

/** Query parameter asking a new window to show a project first. */
export const PROMPT_OPEN_REPO_QUERY = 'promptOpenRepo'

/** Window key of the main window. */
export const PROMPT_MAIN_WINDOW_KEY = 'main'

/** Target of a tab move that opens a new window for the tab. */
export const PROMPT_NEW_WINDOW_TARGET = 'new'

export type PromptWindowSummary = {
  key: string
  /** 1-based position in the window list, main window first. */
  index: number
  /** The project (or workspace) the window shows, for menus. */
  label: string | null
  isSelf: boolean
}

/**
 * What a window should do once its session loaded: select tabs moved into it, or (a session copy)
 * open a new terminal in a workspace and run the copy command there.
 */
export type PromptWindowFocusRequest = {
  worktreeId: string
  tabId: string | null
  startCommand?: string
}

/** A Claude session id as Claude writes it; the copy command is built only from such an id. */
const CLAUDE_SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Command that starts a copy of a Claude session: the same conversation under a new id, so the
 * original keeps running on its own (claude --fork-session). Null for anything but a session id.
 */
export function promptClaudeSessionCopyCommand(sessionId: string): string | null {
  return CLAUDE_SESSION_ID.test(sessionId) ? `claude --resume ${sessionId} --fork-session` : null
}

/** Main only runs commands this file builds, never free text from a window. */
export function isPromptClaudeSessionCopyCommand(command: string): boolean {
  const match = /^claude --resume (\S+) --fork-session$/.exec(command)
  return match !== null && promptClaudeSessionCopyCommand(match[1]!) === command
}

export const PROMPT_WINDOWS_CHANNELS = {
  newWindow: 'promptWindows:new',
  openProject: 'promptWindows:openProject',
  list: 'promptWindows:list',
  moveTab: 'promptWindows:moveTab',
  openSessionCopy: 'promptWindows:openSessionCopy',
  takeFocusRequest: 'promptWindows:takeFocusRequest',
  changed: 'promptWindows:changed'
} as const

/** Worktree ids are "<repoId>::<path>"; the prefix tells which project a record belongs to. */
export function promptRepoIdOfWorktreeId(worktreeId: string): string | null {
  const index = worktreeId.indexOf('::')
  return index > 0 ? worktreeId.slice(0, index) : null
}

/** "Remember Open Windows" is on unless the user turned it off. */
export function isPromptRestoreWindowsOn(
  settings: { promptRestoreWindows?: boolean } | null | undefined
): boolean {
  return settings?.promptRestoreWindows !== false
}
