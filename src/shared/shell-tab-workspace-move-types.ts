/**
 * Why a shell tab stayed where it was when asked to move to another workspace.
 * - layout-owned-by-main: the main-owned layout mode is on; it moves only editor tabs.
 * - tab-not-found / target-not-found: no such terminal tab, or no such workspace.
 * - same-workspace: the tab already lives in the target.
 * - remote: the tab or the target runs over SSH or on a runtime host.
 * - unsupported-shell: Windows shells do not read the `cd -- '<folder>'` that follows the move.
 * - unsupported-folder: the target folder name cannot be typed into a shell line.
 * - no-running-terminal: a pane of the tab has no running terminal (exited or sleeping agent).
 * - running-program: a program (an agent, a build, an editor) runs in one of its shells.
 * - idle-unknown: the host could not tell in time whether a program runs there.
 * - changed: the tab changed while that was being checked; nothing was moved.
 * - renderer-unavailable: no window answered (runtime call only).
 * - failed: the window hit an error while moving (runtime call only).
 */
export type ShellTabMoveRefusal =
  | 'layout-owned-by-main'
  | 'tab-not-found'
  | 'target-not-found'
  | 'same-workspace'
  | 'remote'
  | 'unsupported-shell'
  | 'unsupported-folder'
  | 'no-running-terminal'
  | 'running-program'
  | 'idle-unknown'
  | 'changed'
  | 'renderer-unavailable'
  | 'failed'

export type ShellTabMoveResult =
  | { moved: true; tabId: string; worktreeId: string }
  | { moved: false; reason: ShellTabMoveRefusal }

/** Main asks the window holding the tab to move it; the window answers with the same requestId. */
export type ShellTabWorkspaceMoveRequest = {
  requestId: string
  tabId: string
  targetWorktreeId: string
}

export type ShellTabWorkspaceMoveReply = { requestId: string; result: ShellTabMoveResult }

/** `terminal.moveToWorkspace` result: the terminal handle and tab it named, plus the outcome. */
export type RuntimeTerminalWorkspaceMove = { handle: string; tabId: string } & ShellTabMoveResult
