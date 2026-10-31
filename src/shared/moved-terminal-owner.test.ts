import { afterEach, describe, expect, it } from 'vitest'
import {
  movedTerminalOwnerOf,
  movedTerminalOwnersOf,
  setMovedTerminalOwnerSession,
  worktreeIdsNamedByMovedTerminals,
  type MovedTerminalOwnerSession
} from './moved-terminal-owner'
import { isPtySessionIdOwnedByWorktree, ptyOwnerWorktreeId } from './pty-session-id-format'
import { terminalTabSchema } from './workspace-session-schema'

const SOURCE = 'repo-1::/src/app'
const TARGET = 'repo-2::/src/other'
const PTY = `${SOURCE}@@a1b2c3d4`

function movedSession(overrides: Partial<{ ptyId: string | null; leafPty: string }> = {}) {
  return {
    tabsByWorktree: {
      [SOURCE]: [],
      [TARGET]: [
        {
          id: 't1',
          ptyId: 'ptyId' in overrides ? overrides.ptyId! : PTY,
          adoptedPtyIds: [PTY]
        }
      ]
    },
    terminalLayoutsByTabId: { t1: { ptyIdsByLeafId: { leaf: overrides.leafPty ?? PTY } } }
  } satisfies MovedTerminalOwnerSession
}

afterEach(() => setMovedTerminalOwnerSession(null))

describe('movedTerminalOwnersOf', () => {
  it('names the workspace whose tab took the terminal', () => {
    expect(movedTerminalOwnersOf(movedSession()).get(PTY)).toBe(TARGET)
  })

  it('forgets the move once the tab no longer binds that terminal', () => {
    const session = movedSession({ ptyId: `${TARGET}@@ffff0000`, leafPty: `${TARGET}@@ffff0000` })
    expect(movedTerminalOwnersOf(session).has(PTY)).toBe(false)
  })

  it('leaves a terminal two workspaces both claim to its prefix', () => {
    const session = movedSession()
    const contested = {
      ...session,
      tabsByWorktree: {
        ...session.tabsByWorktree,
        'repo-3::/x': [{ id: 't2', ptyId: PTY, adoptedPtyIds: [PTY] }]
      }
    }
    expect(movedTerminalOwnersOf(contested).has(PTY)).toBe(false)
  })
})

describe('ownership through the installed session', () => {
  it('answers by prefix with no session, and by the move with one', () => {
    expect(ptyOwnerWorktreeId(PTY)).toBe(SOURCE)
    expect(isPtySessionIdOwnedByWorktree(PTY, SOURCE)).toBe(true)

    const session = movedSession()
    setMovedTerminalOwnerSession(() => session)
    expect(movedTerminalOwnerOf(PTY)).toBe(TARGET)
    expect([...worktreeIdsNamedByMovedTerminals()]).toEqual([SOURCE])
    expect(ptyOwnerWorktreeId(PTY)).toBe(TARGET)
    expect(isPtySessionIdOwnedByWorktree(PTY, TARGET)).toBe(true)
    expect(isPtySessionIdOwnedByWorktree(PTY, SOURCE)).toBe(false)
    // Unmoved terminals keep their prefix owner.
    expect(ptyOwnerWorktreeId(`${SOURCE}@@00000000`)).toBe(SOURCE)
  })

  it('falls back to the prefix when the session cannot be read', () => {
    setMovedTerminalOwnerSession(() => {
      throw new Error('session unreadable')
    })
    expect(ptyOwnerWorktreeId(PTY)).toBe(SOURCE)
  })
})

describe('terminalTabSchema', () => {
  const base = {
    id: 't1',
    ptyId: PTY,
    worktreeId: TARGET,
    title: 'Terminal 1',
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 0
  }

  it('keeps adopted terminal ids through a save and load', () => {
    expect(terminalTabSchema.parse({ ...base, adoptedPtyIds: [PTY] }).adoptedPtyIds).toEqual([PTY])
  })

  it('drops a malformed list without losing the tab', () => {
    const parsed = terminalTabSchema.parse({ ...base, adoptedPtyIds: [42] })
    expect(parsed.id).toBe('t1')
    expect(parsed.adoptedPtyIds).toBeUndefined()
  })
})
