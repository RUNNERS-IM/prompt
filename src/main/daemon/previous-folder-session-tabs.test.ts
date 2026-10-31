import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getHistorySessionDirName } from './history-paths'
import {
  readSessionHistoryActivityMs,
  selectPreviousVersionSessionTabCandidates
} from './previous-folder-session-tabs'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000
const RECENT = 'repo1::/wt-a@@recent'
const OLD = 'repo1::/wt-b@@old'

let root: string
let previousRoot: string
let currentRoot: string

function writeHistory(historyRoot: string, sessionId: string, file: string, mtimeMs: number) {
  const dir = join(historyRoot, getHistorySessionDirName(sessionId))
  mkdirSync(dir, { recursive: true })
  const path = join(dir, file)
  writeFileSync(path, 'x')
  utimesSync(path, mtimeMs / 1000, mtimeMs / 1000)
}

function select(sessionIds: string[], isAttached: (id: string) => boolean = () => false) {
  return selectPreviousVersionSessionTabCandidates({
    sessionIds,
    isAttached,
    previousHistoryRoot: previousRoot,
    currentHistoryRoot: currentRoot,
    nowMs: NOW
  })
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pvst-'))
  previousRoot = join(root, 'orca', 'terminal-history')
  currentRoot = join(root, 'Prompt', 'terminal-history')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('previous-version sessions that get a tab', () => {
  it('takes the latest of output.log and checkpoint.json', () => {
    writeHistory(previousRoot, RECENT, 'output.log', NOW - 3 * DAY)
    writeHistory(previousRoot, RECENT, 'checkpoint.json', NOW - DAY)
    expect(readSessionHistoryActivityMs(previousRoot, RECENT)).toBe(NOW - DAY)
  })

  it('keeps sessions used within seven days and skips older ones', () => {
    writeHistory(previousRoot, RECENT, 'output.log', NOW - 6 * DAY)
    writeHistory(previousRoot, OLD, 'output.log', NOW - 8 * DAY)

    const { candidates, skipped } = select([RECENT, OLD])

    expect(candidates).toEqual([
      { sessionId: RECENT, worktreeId: 'repo1::/wt-a', lastActivityAtMs: NOW - 6 * DAY }
    ])
    expect(skipped).toEqual({ stale: 1 })
  })

  it('trusts the folder used before the move over the copy’s fresh times', () => {
    // The move copied the history, so the new folder's file looks touched just now.
    writeHistory(previousRoot, OLD, 'output.log', NOW - 30 * DAY)
    writeHistory(currentRoot, OLD, 'output.log', NOW - 60_000)

    expect(select([OLD])).toEqual({ candidates: [], skipped: { stale: 1 } })
  })

  it('falls back to the current folder when the old one has no history for the session', () => {
    writeHistory(currentRoot, RECENT, 'checkpoint.json', NOW - DAY)
    expect(select([RECENT]).candidates.map((candidate) => candidate.sessionId)).toEqual([RECENT])
  })

  it('makes nothing without any history, without a workspace id, or once attached', () => {
    writeHistory(previousRoot, OLD, 'output.log', NOW - DAY)
    const { candidates, skipped } = select(
      [RECENT, 'no-separator', OLD],
      (sessionId) => sessionId === OLD
    )
    expect(candidates).toEqual([])
    expect(skipped).toEqual({ 'no-history': 1, 'no-workspace-id': 1, attached: 1 })
  })
})
