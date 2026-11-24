import { beforeEach, describe, expect, it } from 'vitest'
import { makePaneKey } from '../../../shared/stable-pane-id'
import {
  isClaudeSessionRunningElsewhere,
  noteClaudeResumeLaunch,
  resetClaudeResumeDuplicateGuardForTests
} from './claude-resume-duplicate-guard'

const SESSION = '3778e012-0000-4000-8000-000000000001'
const LEAF_A = '0195f2ce-1111-4000-8000-00000000000a'
const LEAF_B = '0195f2ce-1111-4000-8000-00000000000b'
const PANE_A = makePaneKey('tab-a', LEAF_A)
const PANE_B = makePaneKey('tab-b', LEAF_B)

function stateWith(options: { bPty?: string; pending?: Record<string, 'claude'> } = {}) {
  return {
    agentStatusByPaneKey: {
      [PANE_B]: {
        agentType: 'claude',
        providerSession: { key: 'session_id', id: SESSION }
      }
    },
    terminalLayoutsByTabId: options.bPty
      ? { 'tab-b': { ptyIdsByLeafId: { [LEAF_B]: options.bPty } } }
      : {},
    pendingPaneAccountRestarts: options.pending ?? {}
  } as unknown as Parameters<typeof isClaudeSessionRunningElsewhere>[0]
}

describe('isClaudeSessionRunningElsewhere', () => {
  beforeEach(() => resetClaudeResumeDuplicateGuardForTests())

  it('sees another live pane on the same conversation', () => {
    expect(isClaudeSessionRunningElsewhere(stateWith({ bPty: 'pty-b' }), SESSION, PANE_A)).toBe(true)
  })

  it('ignores the pane itself and closed panes', () => {
    expect(isClaudeSessionRunningElsewhere(stateWith({ bPty: 'pty-b' }), SESSION, PANE_B)).toBe(
      false
    )
    expect(isClaudeSessionRunningElsewhere(stateWith(), SESSION, PANE_A)).toBe(false)
  })

  it('lets the first of two panes waiting for the same restart go, then stops the second', () => {
    const state = stateWith({ bPty: 'pty-b', pending: { 'pty-b': 'claude' } })
    expect(isClaudeSessionRunningElsewhere(state, SESSION, PANE_A, 1000)).toBe(false)
    noteClaudeResumeLaunch(SESSION, PANE_A, 1000)
    expect(isClaudeSessionRunningElsewhere(stateWith(), SESSION, PANE_B, 2000)).toBe(true)
  })

  it('forgets a launch after a minute and allows the same pane again', () => {
    noteClaudeResumeLaunch(SESSION, PANE_A, 0)
    expect(isClaudeSessionRunningElsewhere(stateWith(), SESSION, PANE_A, 1000)).toBe(false)
    expect(isClaudeSessionRunningElsewhere(stateWith(), SESSION, PANE_B, 61_000)).toBe(false)
  })
})
