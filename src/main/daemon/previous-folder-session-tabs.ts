/**
 * Main's half of the one-time tab creation for previous-folder daemon sessions: pick the
 * recently used sessions, and remember once the window has made their tabs.
 *
 * "Recently used" reads the session's terminal history (output.log / checkpoint.json). Copying
 * the data folder during the move rewrote modification times in the new folder, so the old
 * folder's files decide when they exist (read only; that folder is shared with upstream Orca).
 */
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parsePtySessionId } from '../../shared/pty-session-id-format'
import {
  PREVIOUS_VERSION_SESSION_RECENT_WINDOW_MS,
  type PreviousVersionSessionMainSkipReason,
  type PreviousVersionSessionTabCandidate
} from '../../shared/previous-version-session-tabs'
import { getHistorySessionDirName } from './history-paths'

const ACTIVITY_FILE_NAMES = ['output.log', 'checkpoint.json'] as const

export const PREVIOUS_VERSION_SESSION_TABS_MARKER_FILE = 'prompt-previous-version-session-tabs.json'

/** Latest modification time of the session's history files under one history root, if any. */
export function readSessionHistoryActivityMs(
  historyRoot: string,
  sessionId: string
): number | null {
  const dir = join(historyRoot, getHistorySessionDirName(sessionId))
  let latest: number | null = null
  for (const name of ACTIVITY_FILE_NAMES) {
    try {
      const mtimeMs = statSync(join(dir, name)).mtimeMs
      latest = latest === null ? mtimeMs : Math.max(latest, mtimeMs)
    } catch {
      // A missing file is just no evidence.
    }
  }
  return latest
}

export type PreviousVersionSessionSelection = {
  candidates: PreviousVersionSessionTabCandidate[]
  skipped: Partial<Record<PreviousVersionSessionMainSkipReason, number>>
}

export function selectPreviousVersionSessionTabCandidates(args: {
  sessionIds: readonly string[]
  isAttached: (sessionId: string) => boolean
  /** terminal-history of the folder used before the move. */
  previousHistoryRoot: string
  /** terminal-history of the current folder. */
  currentHistoryRoot: string
  nowMs: number
  recentWindowMs?: number
}): PreviousVersionSessionSelection {
  const recentWindowMs = args.recentWindowMs ?? PREVIOUS_VERSION_SESSION_RECENT_WINDOW_MS
  const candidates: PreviousVersionSessionTabCandidate[] = []
  const skipped: PreviousVersionSessionSelection['skipped'] = {}
  const skip = (reason: PreviousVersionSessionMainSkipReason): void => {
    skipped[reason] = (skipped[reason] ?? 0) + 1
  }
  for (const sessionId of new Set(args.sessionIds)) {
    if (args.isAttached(sessionId)) {
      skip('attached')
      continue
    }
    const { worktreeId } = parsePtySessionId(sessionId)
    if (!worktreeId) {
      skip('no-workspace-id')
      continue
    }
    const lastActivityAtMs =
      readSessionHistoryActivityMs(args.previousHistoryRoot, sessionId) ??
      readSessionHistoryActivityMs(args.currentHistoryRoot, sessionId)
    if (lastActivityAtMs === null) {
      skip('no-history')
      continue
    }
    if (args.nowMs - lastActivityAtMs > recentWindowMs) {
      skip('stale')
      continue
    }
    candidates.push({ sessionId, worktreeId, lastActivityAtMs })
  }
  candidates.sort((a, b) => a.lastActivityAtMs - b.lastActivityAtMs)
  return { candidates, skipped }
}

export function isPreviousVersionSessionTabsDone(markerPath: string): boolean {
  try {
    const parsed = JSON.parse(readFileSync(markerPath, 'utf8')) as { doneAtMs?: unknown }
    return typeof parsed.doneAtMs === 'number'
  } catch {
    return false
  }
}
