import { describe, expect, it } from 'vitest'
import { planPromptSessionDrop, promptSessionDropWorktreeIdOf } from './prompt-session-row-drop'

const SESSION = '0f8e2a7c-1b2d-4c3e-9f40-5a6b7c8d9e0f'
const OTHER_SESSION = '11111111-2222-4333-8444-555555555555'
const BASE = {
  sourceWorktreeId: 'repo-1::/src/app',
  sourceIsLocal: true,
  targetIsLocal: true
}

describe('planPromptSessionDrop', () => {
  it('leaves a drop on the same workspace to the reorder', () => {
    expect(
      planPromptSessionDrop({ ...BASE, targetWorktreeId: BASE.sourceWorktreeId, panes: null })
    ).toEqual({ kind: 'reorder' })
  })

  it('cancels a drop outside every workspace', () => {
    expect(planPromptSessionDrop({ ...BASE, targetWorktreeId: null, panes: [] })).toEqual({
      kind: 'cancel',
      reason: 'no-target'
    })
  })

  it('copies a Claude session into another workspace, in the same or another project', () => {
    for (const targetWorktreeId of ['repo-1::/src/app-feature', 'repo-2::/src/other']) {
      expect(
        planPromptSessionDrop({
          ...BASE,
          targetWorktreeId,
          panes: [{ agentType: 'claude', sessionId: SESSION }]
        })
      ).toEqual({
        kind: 'fork',
        targetWorktreeId,
        command: `claude --resume ${SESSION} --fork-session`
      })
    }
  })

  it('cancels a drop that touches a remote workspace on either side', () => {
    const panes = [{ agentType: 'claude', sessionId: SESSION }]
    for (const hosts of [
      { sourceIsLocal: false, targetIsLocal: true },
      { sourceIsLocal: true, targetIsLocal: false }
    ]) {
      expect(
        planPromptSessionDrop({ ...BASE, ...hosts, targetWorktreeId: 'repo-2::/x', panes })
      ).toEqual({ kind: 'cancel', reason: 'remote' })
    }
  })

  it('moves a plain terminal row with its shell', () => {
    expect(planPromptSessionDrop({ ...BASE, targetWorktreeId: 'repo-2::/x', panes: null })).toEqual(
      { kind: 'move-shell', targetWorktreeId: 'repo-2::/x' }
    )
  })

  it('cancels when no Claude conversation can be named', () => {
    for (const panes of [
      [],
      [{ agentType: 'codex', sessionId: SESSION }],
      [{ agentType: 'claude', sessionId: null }],
      [{ agentType: 'claude', sessionId: 'not-a-session-id; rm -rf ~' }]
    ]) {
      expect(planPromptSessionDrop({ ...BASE, targetWorktreeId: 'repo-2::/x', panes })).toEqual({
        kind: 'cancel',
        reason: 'no-claude-session'
      })
    }
  })

  it('cancels a tab with two Claude conversations, but not one shown twice', () => {
    const target = 'repo-2::/x'
    expect(
      planPromptSessionDrop({
        ...BASE,
        targetWorktreeId: target,
        panes: [
          { agentType: 'claude', sessionId: SESSION },
          { agentType: 'claude', sessionId: OTHER_SESSION }
        ]
      })
    ).toEqual({ kind: 'cancel', reason: 'several-claude-sessions' })
    expect(
      planPromptSessionDrop({
        ...BASE,
        targetWorktreeId: target,
        panes: [
          { agentType: 'claude', sessionId: SESSION },
          { agentType: 'claude', sessionId: SESSION },
          { agentType: 'codex', sessionId: OTHER_SESSION }
        ]
      }).kind
    ).toBe('fork')
  })
})

describe('promptSessionDropWorktreeIdOf', () => {
  it('reads the workspace id of the rows around the element', () => {
    const rows = { getAttribute: () => 'repo-2::/x' }
    const element = { closest: () => rows } as unknown as Element
    expect(promptSessionDropWorktreeIdOf(element)).toBe('repo-2::/x')
    const outside = { closest: () => null } as unknown as Element
    expect(promptSessionDropWorktreeIdOf(outside)).toBeNull()
    expect(promptSessionDropWorktreeIdOf(null)).toBeNull()
  })
})
