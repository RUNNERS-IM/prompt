import { describe, expect, it } from 'vitest'
import { promptTabLabel } from './prompt-tab-label'

describe('promptTabLabel', () => {
  it('drops the brackets around a leading project name', () => {
    expect(promptTabLabel('[PROMPT] 개발')).toBe('PROMPT 개발')
    expect(promptTabLabel('[RUNNERS] m2-pro-1')).toBe('RUNNERS m2-pro-1')
  })

  it('drops a leading status glyph before the brackets', () => {
    expect(promptTabLabel('✳ [PUDDING] 관리')).toBe('PUDDING 관리')
  })

  it('keeps titles without a leading bracket as they are', () => {
    expect(promptTabLabel('zsh')).toBe('zsh')
    expect(promptTabLabel('빌드 [2]')).toBe('빌드 [2]')
  })

  it('keeps the bracket text when nothing follows it', () => {
    expect(promptTabLabel('[PROMPT]')).toBe('PROMPT')
  })
})
