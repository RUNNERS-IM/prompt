import { afterEach, describe, expect, it } from 'vitest'
import {
  setMovedTerminalOwnerSession,
  type MovedTerminalOwnerSession
} from '../../../../shared/moved-terminal-owner'
import type { RuntimePtyWorktreeRecord } from '../../runtime-terminal-state-records'
import { collectWorktreePtyIds } from './worktree-pty-collection'

const SOURCE = 'repo-1::/src/app'
const TARGET = 'repo-1::/src/other'
const MOVED = `${SOURCE}@@a1b2c3d4`
const STAYED = `${SOURCE}@@00000001`

/** The runtime still records both shells under SOURCE, where they started. */
const leaves = [
  { worktreeId: SOURCE, ptyId: MOVED },
  { worktreeId: SOURCE, ptyId: STAYED }
]
const ptysById = new Map(
  [MOVED, STAYED].map((ptyId) => [
    ptyId,
    { ptyId, worktreeId: SOURCE, connectionId: null, connected: true } as RuntimePtyWorktreeRecord
  ])
)

function installMove(): void {
  const session: MovedTerminalOwnerSession = {
    tabsByWorktree: {
      [SOURCE]: [{ id: 't-stayed', ptyId: STAYED }],
      [TARGET]: [{ id: 't-moved', ptyId: MOVED, adoptedPtyIds: [MOVED] }]
    },
    terminalLayoutsByTabId: {
      't-stayed': { ptyIdsByLeafId: { 'leaf-1': STAYED } },
      't-moved': { ptyIdsByLeafId: { 'leaf-1': MOVED } }
    }
  }
  setMovedTerminalOwnerSession(() => session)
}

afterEach(() => setMovedTerminalOwnerSession(null))

describe('runtime terminals a workspace stop targets', () => {
  it('skips a shell that moved away from the workspace being stopped', () => {
    installMove()
    const local = { resolvedConnectionId: null }
    expect([...collectWorktreePtyIds(leaves, ptysById, SOURCE, local)]).toEqual([STAYED])
    expect([...collectWorktreePtyIds(leaves, ptysById, TARGET, local)]).toEqual([MOVED])
  })

  it('without a move record every shell belongs to the workspace it started in', () => {
    const local = { resolvedConnectionId: null }
    expect([...collectWorktreePtyIds(leaves, ptysById, SOURCE, local)].sort()).toEqual(
      [MOVED, STAYED].sort()
    )
  })
})
