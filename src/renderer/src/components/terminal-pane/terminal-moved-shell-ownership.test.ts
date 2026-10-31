import { afterEach, describe, expect, it } from 'vitest'
import { setMovedTerminalOwnerSession } from '../../../../shared/moved-terminal-owner'
import { classifyEvictionExemptTerminalPty } from './terminal-hidden-worktree-retention'
import { isSnapshotBackedTerminalPty } from './terminal-hidden-view-parking'

const SOURCE = 'repo-1::/src/app'
const TARGET = 'repo-2::/src/other'
const MOVED = `${SOURCE}@@a1b2c3d4`

function installMove(): void {
  const session = {
    tabsByWorktree: {
      [SOURCE]: [],
      [TARGET]: [{ id: 't1', ptyId: MOVED, adoptedPtyIds: [MOVED] }]
    },
    terminalLayoutsByTabId: { t1: { ptyIdsByLeafId: { leaf: MOVED } } }
  }
  setMovedTerminalOwnerSession(() => session)
}

afterEach(() => setMovedTerminalOwnerSession(null))

describe('hidden terminals moved to another workspace', () => {
  it('treat the moved shell as foreign before the move, and as owned after it', () => {
    expect(classifyEvictionExemptTerminalPty(MOVED, TARGET)).toBe('foreign-worktree')
    expect(isSnapshotBackedTerminalPty(MOVED, TARGET)).toBe(false)

    installMove()
    expect(classifyEvictionExemptTerminalPty(MOVED, TARGET)).not.toBe('foreign-worktree')
    expect(isSnapshotBackedTerminalPty(MOVED, TARGET)).toBe(true)
    expect(isSnapshotBackedTerminalPty(MOVED, SOURCE)).toBe(false)
  })
})
