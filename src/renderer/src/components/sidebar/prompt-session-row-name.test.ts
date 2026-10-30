import { describe, expect, it } from 'vitest'
import {
  isPromptPlaceholderSessionName,
  promptNewSessionLabel,
  promptSessionTabName
} from './prompt-session-row-name'

const tab = (fields: Record<string, unknown>) => ({
  title: '',
  customTitle: null,
  aiVaultTitle: null,
  defaultTitle: 'Terminal 3',
  ...fields
})

describe('promptSessionTabName', () => {
  it('treats the stand-in names of a fresh session as no name yet', () => {
    expect(promptSessionTabName(tab({ title: 'Terminal 3' }), 'claude')).toBe('')
    expect(promptSessionTabName(tab({ title: 'Terminal 12' }), 'claude')).toBe('')
    expect(promptSessionTabName(tab({ title: '✳ Claude Code' }), 'claude')).toBe('')
    expect(promptSessionTabName(tab({ title: 'claude' }), 'claude')).toBe('')
    expect(promptSessionTabName(tab({ title: 'Claude' }), 'claude')).toBe('')
  })

  it('keeps the title Claude gives after the first conversation', () => {
    expect(promptSessionTabName(tab({ title: '✳ Fix sidebar row height' }), 'claude')).toBe(
      'Fix sidebar row height'
    )
  })

  it('always keeps a name the person set, even one that looks like a stand-in', () => {
    expect(promptSessionTabName(tab({ title: 'x', customTitle: 'Terminal 3' }), 'claude')).toBe(
      'Terminal 3'
    )
  })

  it('does not treat a program name as a stand-in when the agent is unknown', () => {
    expect(isPromptPlaceholderSessionName('Claude Code', { customTitle: null }, undefined)).toBe(
      false
    )
    expect(isPromptPlaceholderSessionName('', { customTitle: null }, undefined)).toBe(true)
  })

  it('calls such a session "New Session"', () => {
    expect(promptNewSessionLabel()).toBe('New Session')
  })
})
