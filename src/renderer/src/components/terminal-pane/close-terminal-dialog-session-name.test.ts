import { describe, expect, it } from 'vitest'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import { resolveCloseDialogSessionName } from './close-terminal-dialog-session-name'

function tab(fields: Partial<TerminalTab>): TerminalTab {
  return { id: 'tab-1', title: '', customTitle: null, ...fields } as TerminalTab
}

describe('resolveCloseDialogSessionName', () => {
  it('uses the current tab name, not the label captured when the close was asked', () => {
    const state = {
      tabsByWorktree: { wt: [tab({ customTitle: 'Release notes', title: '[PROMPT] 개발' })] }
    }
    expect(resolveCloseDialogSessionName(state, 'tab-1', '[PROMPT] 개발')).toBe('Release notes')
  })

  it('drops the agent glyph from a live title like the tab strip does', () => {
    const state = { tabsByWorktree: { wt: [tab({ title: '✳ Fix login' })] } }
    expect(resolveCloseDialogSessionName(state, 'tab-1', undefined)).toBe('Fix login')
  })

  it('keeps the passed label for tabs that are not terminal tabs', () => {
    expect(resolveCloseDialogSessionName({ tabsByWorktree: {} }, 'chat-1', ' Chat ')).toBe('Chat')
    expect(resolveCloseDialogSessionName({ tabsByWorktree: {} }, undefined, undefined)).toBe('')
  })
})
