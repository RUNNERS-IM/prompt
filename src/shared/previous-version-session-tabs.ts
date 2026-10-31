/**
 * One-time tab creation for terminals still running in the daemon from Prompt's previous data
 * folder that no saved tab names. Main picks recently used sessions; the window creates the tabs
 * (attached when opened) and reports back, and main then records that this was done.
 */

export const PREVIOUS_VERSION_SESSION_TABS_CHANNEL = 'pty:previousVersionSessionTabs'

/** A session counts as recently used when its terminal history changed within this window. */
export const PREVIOUS_VERSION_SESSION_RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export type PreviousVersionSessionTabCandidate = {
  sessionId: string
  worktreeId: string
  lastActivityAtMs: number
}

/** Main skips: no workspace in the id, no history, history older than the window, attached already. */
export type PreviousVersionSessionMainSkipReason =
  | 'no-workspace-id'
  | 'no-history'
  | 'stale'
  | 'attached'

/** Window skips: a tab already names it, the workspace is gone or remote, or creation threw. */
export type PreviousVersionSessionWindowSkipReason =
  | 'has-tab'
  | 'workspace-gone'
  | 'remote-workspace'
  | 'create-failed'

export type PreviousVersionSessionTabsListResult =
  | { status: 'pending'; candidates: PreviousVersionSessionTabCandidate[] }
  /** Already done in an earlier launch, or claimed by another window in this one. */
  | { status: 'done' }
  /** This profile did not move from a previous data folder. */
  | { status: 'not-applicable' }
  /** The terminal daemon is not usable yet; try again next launch. */
  | { status: 'not-ready' }

export type PreviousVersionSessionTabsReport = {
  created: number
  skipped: Partial<Record<PreviousVersionSessionWindowSkipReason, number>>
}
