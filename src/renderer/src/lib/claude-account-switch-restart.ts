import { useAppStore } from '@/store'
import { announceRestart, type RestartingPane } from './claude-account-restart-toast'
import type { ClaudeSessionMoveCandidate } from './claude-session-account-move'
import type { notMovedSessions } from './claude-switch-session-labels'
import {
  findClaudeSessionsStoppedAtUsageLimit,
  markContinueAfterRestart
} from './claude-usage-limit-sessions'

function queueClaudeRestarts(ptyIds: string[]): void {
  useAppStore.getState().queuePaneAccountRestarts(ptyIds, 'claude')
}

/**
 * Restart these sessions on the selected account. Those stopped at their usage limit, picker included,
 * get a continue line once resumed. All are queued together; each runs as soon as its turn allows.
 */
export async function restartClaudeSessions(
  sessions: readonly ClaudeSessionMoveCandidate[],
  announce: RestartAnnouncement
): Promise<void> {
  const stopped = await findClaudeSessionsStoppedAtUsageLimit(sessions)
  queueClaudeRestartsWithContinue(sessions, stopped, announce)
}

type RestartAnnouncement = {
  account: string
  others?: number
  review?: () => void
  notMoved?: ReturnType<typeof notMovedSessions>
  /** The continue line; the window's own wording when absent. */
  continueText?: string
}

/** Queue the restarts already sorted out; `stopped` get the continue line once resumed. */
export function queueClaudeRestartsWithContinue(
  sessions: readonly ClaudeSessionMoveCandidate[],
  stopped: readonly ClaudeSessionMoveCandidate[],
  announce: RestartAnnouncement
): void {
  const panes = currentPanes(sessions)
  const stoppedPtyIds = currentPanes(stopped).map((pane) => pane.ptyId)
  markContinueAfterRestart(stoppedPtyIds, announce.continueText)
  queueClaudeRestarts(panes.map((pane) => pane.ptyId))
  const { account, others = 0, review, notMoved } = announce
  announceRestart(panes, account, others, review, notMoved)
}

/** Why now: a reattach can rebind a pane while the dialog is open, and a closed pane has none. */
function currentPanes(sessions: readonly ClaudeSessionMoveCandidate[]): RestartingPane[] {
  const layouts = useAppStore.getState().terminalLayoutsByTabId
  return sessions.flatMap((session) => {
    const ptyId = layouts[session.tabId]?.ptyIdsByLeafId?.[session.leafId]
    return ptyId ? [{ ptyId, tabId: session.tabId, leafId: session.leafId }] : []
  })
}
