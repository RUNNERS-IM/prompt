import type { AppState } from '../types'
import { recordClosedTerminalTabTombstone } from '../../../../shared/closed-terminal-tab-tombstones'
import { removeSleepingAgentSessionsForTab } from '../slices/terminal-tab-retirement'

export function findTerminalTabWorktreeId(state: AppState, tabId: string): string | null {
  for (const [worktreeId, tabs] of Object.entries(state.tabsByWorktree)) {
    if (tabs.some((tab) => tab.id === tabId)) {
      return worktreeId
    }
  }
  return null
}

/**
 * A tab whose process exited cleanly (Claude quit, the shell ended) is closed for good: record
 * the close as a user close is recorded and drop its resume record. Without this, a later window
 * save or a workspace reopen brings it back as an empty pane. Host loss, signals (reboot, logout)
 * and tabs closed while their PTY lives on (moves) never come here, so they stay recoverable.
 */
export function recordTerminalProcessExitClose(
  state: Pick<AppState, 'closedTerminalTabTombstonesByTabId' | 'sleepingAgentSessionsByPaneKey'>,
  tabId: string,
  worktreeId: string,
  now = Date.now()
): Pick<AppState, 'closedTerminalTabTombstonesByTabId' | 'sleepingAgentSessionsByPaneKey'> {
  return {
    closedTerminalTabTombstonesByTabId: recordClosedTerminalTabTombstone(
      state.closedTerminalTabTombstonesByTabId,
      tabId,
      { worktreeId, reason: 'pty-exit' },
      now
    ),
    sleepingAgentSessionsByPaneKey: removeSleepingAgentSessionsForTab(
      state.sleepingAgentSessionsByPaneKey,
      tabId
    )
  }
}
