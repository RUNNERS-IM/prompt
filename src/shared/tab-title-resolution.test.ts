import { describe, expect, it } from 'vitest'
import {
  isDefaultTerminalTabName,
  resolveTerminalTabTitle,
  resolveUnifiedTabLabel,
  terminalTabSetName
} from './tab-title-resolution'

const terminal = (fields: Record<string, unknown>) => ({
  title: '',
  customTitle: null,
  aiVaultTitle: undefined,
  ...fields
})

const unified = (fields: Record<string, unknown>) => ({
  label: '',
  customLabel: null,
  ...fields
})

describe('isDefaultTerminalTabName', () => {
  it('matches the numbered starting name, also translated', () => {
    expect(isDefaultTerminalTabName('Terminal 1')).toBe(true)
    expect(isDefaultTerminalTabName(' terminal 12 ')).toBe(true)
    expect(isDefaultTerminalTabName('터미널 3')).toBe(true)
    expect(isDefaultTerminalTabName('ターミナル 3')).toBe(true)
  })

  it('leaves chosen names alone', () => {
    expect(isDefaultTerminalTabName('')).toBe(false)
    expect(isDefaultTerminalTabName('Terminal')).toBe(false)
    expect(isDefaultTerminalTabName('Terminal 1 logs')).toBe(false)
    expect(isDefaultTerminalTabName('[SENSE] AI 홈')).toBe(false)
  })
})

describe('terminalTabSetName', () => {
  it('treats a set name that is only the starting name as none', () => {
    expect(terminalTabSetName({ customTitle: 'Terminal 1' })).toBe('')
    expect(terminalTabSetName({ customTitle: ' my tab ' })).toBe('my tab')
  })
})

describe('resolveTerminalTabTitle', () => {
  it('shows the /rename title over a set name that is only the starting name', () => {
    const tab = terminal({
      title: '✳ [SENSE] AI 홈',
      customTitle: 'Terminal 1',
      defaultTitle: 'Terminal 1',
      aiVaultTitle: { agent: 'claude', sessionId: 's', title: '[SENSE] AI 홈' }
    })
    expect(resolveTerminalTabTitle(tab, false)).toBe('[SENSE] AI 홈')
  })

  it('still puts a chosen set name first, also one the tab was created with', () => {
    // `terminal create --title` keeps the title as the tab's defaultTitle as well.
    const tab = terminal({
      customTitle: 'my tab',
      defaultTitle: 'my tab',
      aiVaultTitle: { agent: 'claude', sessionId: 's', title: 'other' }
    })
    expect(resolveTerminalTabTitle(tab, false)).toBe('my tab')
  })
})

describe('resolveUnifiedTabLabel', () => {
  it('skips a terminal tab label that is only the starting name', () => {
    const tab = unified({ contentType: 'terminal', customLabel: 'Terminal 2', label: 'build' })
    expect(resolveUnifiedTabLabel(tab, false)).toBe('build')
  })

  it('keeps such a label on a tab that is not a terminal', () => {
    const tab = unified({ contentType: 'browser', customLabel: 'Terminal 2', label: 'docs' })
    expect(resolveUnifiedTabLabel(tab, false)).toBe('Terminal 2')
  })
})
