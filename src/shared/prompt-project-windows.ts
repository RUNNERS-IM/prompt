/**
 * Prompt project windows: a project can be opened in its own full window (sidebar shows only that
 * project, its tabs and live terminals). While it is open there, that window owns the project's
 * sessions and the main window shows a single "open in its own window" row instead.
 */

/** Query parameter on the renderer URL naming the project a window shows. */
export const PROMPT_PROJECT_WINDOW_QUERY = 'promptProjectWindow'

export type PromptProjectWindowsState = {
  /** The project this window shows, or null for the main window. */
  selfRepoId: string | null
  /** Projects currently open in their own windows. */
  openRepoIds: string[]
}

export const PROMPT_PROJECT_WINDOWS_CHANNELS = {
  open: 'promptProjectWindows:open',
  focus: 'promptProjectWindows:focus',
  state: 'promptProjectWindows:state',
  changed: 'promptProjectWindows:changed'
} as const

/** Worktree ids are "<repoId>::<path>"; the prefix tells which project a record belongs to. */
export function promptRepoIdOfWorktreeId(worktreeId: string): string | null {
  const index = worktreeId.indexOf('::')
  return index > 0 ? worktreeId.slice(0, index) : null
}

/** "Remember Open Windows" is on unless the user turned it off. */
export function isPromptRestoreProjectWindowsOn(
  settings: { promptRestoreProjectWindows?: boolean } | null | undefined
): boolean {
  return settings?.promptRestoreProjectWindows !== false
}
