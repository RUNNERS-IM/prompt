import { describe, expect, it } from 'vitest'
import { isLeftToRightOnlyRoute, mirroredInRtl, routeDirection, uiDirectionFor } from './ui-direction'

describe('ui direction', () => {
  it('reads right to left only for Arabic', () => {
    expect(uiDirectionFor('ar')).toBe('rtl')
    expect(uiDirectionFor('he' as never)).toBe('ltr')
    expect(uiDirectionFor('en')).toBe('ltr')
    expect(uiDirectionFor('zh-Hans')).toBe('ltr')
  })

  it('keeps Home and host screens left to right, like the desktop terminal and session list', () => {
    expect(isLeftToRightOnlyRoute('/')).toBe(true)
    expect(isLeftToRightOnlyRoute('/h/host-1')).toBe(true)
    expect(isLeftToRightOnlyRoute('/h/host-1/session/wt')).toBe(true)
    expect(isLeftToRightOnlyRoute('/new-workspace')).toBe(true)
    expect(routeDirection('ar', '/h/host-1/files/wt')).toBe('ltr')
  })

  it('turns settings, pairing and info screens right to left in Arabic', () => {
    for (const route of ['/settings', '/about', '/pair', '/pair-confirm', '/troubleshoot']) {
      expect(routeDirection('ar', route)).toBe('rtl')
      expect(routeDirection('ko', route)).toBe('ltr')
    }
    expect(isLeftToRightOnlyRoute('/help')).toBe(false)
  })

  it('mirrors chevrons only under right to left', () => {
    expect(mirroredInRtl('rtl')).toEqual({ transform: [{ scaleX: -1 }] })
    expect(mirroredInRtl('ltr')).toBeUndefined()
  })
})
