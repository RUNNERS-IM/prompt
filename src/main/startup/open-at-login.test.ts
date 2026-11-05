import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {} }))

const { shouldMarkOpenAtLoginApplied, shouldRegisterOpenAtLogin } = await import('./open-at-login')

const base = { platform: 'darwin' as NodeJS.Platform, packaged: true, applied: false, on: false }

describe('open at login default', () => {
  it('registers on the first release launch on a Mac', () => {
    expect(shouldRegisterOpenAtLogin(base)).toBe(true)
    expect(shouldMarkOpenAtLoginApplied(base)).toBe(true)
  })

  it('does nothing again once applied, so turning it off sticks', () => {
    expect(shouldRegisterOpenAtLogin({ ...base, applied: true })).toBe(false)
    expect(shouldMarkOpenAtLoginApplied({ ...base, applied: true })).toBe(false)
  })

  it('leaves an existing login item alone but still marks it applied', () => {
    expect(shouldRegisterOpenAtLogin({ ...base, on: true })).toBe(false)
    expect(shouldMarkOpenAtLoginApplied(base)).toBe(true)
  })

  it('never registers a dev copy of Electron', () => {
    expect(shouldRegisterOpenAtLogin({ ...base, packaged: false })).toBe(false)
    expect(shouldMarkOpenAtLoginApplied({ ...base, packaged: false })).toBe(false)
  })

  it('skips Windows and Linux for now', () => {
    expect(shouldRegisterOpenAtLogin({ ...base, platform: 'win32' })).toBe(false)
    expect(shouldRegisterOpenAtLogin({ ...base, platform: 'linux' })).toBe(false)
  })
})
