import { describe, expect, it } from 'vitest'
import { isAutomaticUpdateCheckOn } from './automatic-update-check'

describe('automatic update check setting', () => {
  it('is on by default and for settings saved before it existed', () => {
    expect(isAutomaticUpdateCheckOn({})).toBe(true)
    expect(isAutomaticUpdateCheckOn(null)).toBe(true)
  })

  it('is off only when switched off', () => {
    expect(isAutomaticUpdateCheckOn({ autoCheckUpdates: false })).toBe(false)
    expect(isAutomaticUpdateCheckOn({ autoCheckUpdates: true })).toBe(true)
  })
})
