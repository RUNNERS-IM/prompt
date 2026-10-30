import { describe, expect, it } from 'vitest'
import {
  parseClaudeStatusLineModel,
  preserveClaudeStatusLineModel
} from './prompt-claude-statusline-model'

function formBody(payload: unknown, paneKey = 'tab-1:leaf'): Record<string, string> {
  return { paneKey, payload: JSON.stringify(payload) }
}

describe('parseClaudeStatusLineModel', () => {
  it('prefers display_name and falls back to id', () => {
    expect(
      parseClaudeStatusLineModel(
        formBody({ model: { id: 'claude-opus-4-1', display_name: 'Opus 4.1' } })
      )
    ).toEqual({ paneKey: 'tab-1:leaf', model: 'Opus 4.1' })
    expect(parseClaudeStatusLineModel(formBody({ model: { id: 'claude-haiku' } }))).toEqual({
      paneKey: 'tab-1:leaf',
      model: 'claude-haiku'
    })
  })

  it('returns null without a pane key, model, or valid JSON', () => {
    expect(parseClaudeStatusLineModel(formBody({ model: { id: 'x' } }, ''))).toBeNull()
    expect(parseClaudeStatusLineModel(formBody({ rate_limits: {} }))).toBeNull()
    expect(parseClaudeStatusLineModel({ paneKey: 'p', payload: '{' })).toBeNull()
  })
})

describe('preserveClaudeStatusLineModel', () => {
  const row = (agentType: string, model?: string) => ({
    payload: { agentType, ...(model ? { model } : {}) }
  })

  it('keeps the previous Claude model when a hook omits it', () => {
    expect(preserveClaudeStatusLineModel(row('claude', 'Opus'), row('claude'), true)).toEqual(
      row('claude', 'Opus')
    )
  })

  it('does not carry the model across owners or agents', () => {
    expect(preserveClaudeStatusLineModel(row('claude', 'Opus'), row('claude'), false)).toEqual(
      row('claude')
    )
    expect(preserveClaudeStatusLineModel(row('claude', 'Opus'), row('codex'), true)).toEqual(
      row('codex')
    )
  })
})
