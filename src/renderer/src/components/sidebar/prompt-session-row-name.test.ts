import { describe, expect, it } from 'vitest'
import {
  isPromptPlaceholderSessionName,
  promptNewSessionLabel,
  promptSessionTabName,
  promptTerminalTabName
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

  it('keeps a name the person set', () => {
    expect(promptSessionTabName(tab({ title: 'x', customTitle: 'my tab' }), 'claude')).toBe(
      'my tab'
    )
  })

  it('shows the /rename title when the set name is only the starting name', () => {
    const renamed = { sessionId: 's', agent: 'claude', title: '[SENSE] AI 홈' }
    const restored = tab({
      title: '[SENSE] AI 홈',
      customTitle: 'Terminal 1',
      defaultTitle: 'Terminal 1',
      aiVaultTitle: renamed
    })
    expect(promptTerminalTabName(restored)).toBe('[SENSE] AI 홈')
    expect(promptSessionTabName(restored, 'claude')).toBe('[SENSE] AI 홈')
    // A starting name of another number, or as a translated UI shows it, is no set name either.
    expect(promptTerminalTabName(tab({ title: 'Fix it', customTitle: 'Terminal 7' }))).toBe(
      'Fix it'
    )
    expect(promptTerminalTabName(tab({ title: 'Fix it', customTitle: '터미널 2' }))).toBe('Fix it')
    expect(
      promptSessionTabName(tab({ title: 'Terminal 3', customTitle: 'Terminal 3' }), 'claude')
    ).toBe('')
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
