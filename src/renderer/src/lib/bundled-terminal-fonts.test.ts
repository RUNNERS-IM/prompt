import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resetBundledTerminalFontsForTests,
  subscribeBundledTerminalFontSettled,
  terminalFontFamilyReadyForMeasure
} from './bundled-terminal-fonts'

describe('terminalFontFamilyReadyForMeasure', () => {
  let resolveLoad: () => void
  const load = vi.fn()

  beforeEach(() => {
    resetBundledTerminalFontsForTests()
    load.mockReset()
    const pending = new Promise<void>((resolve) => {
      resolveLoad = resolve
    })
    load.mockReturnValue(pending)
    vi.stubGlobal('document', { fonts: { load } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('passes fonts that ship with the system straight through', () => {
    expect(terminalFontFamilyReadyForMeasure('JetBrains Mono')).toBe('JetBrains Mono')
    expect(load).not.toHaveBeenCalled()
  })

  it('holds D2Coding back until both faces load, then tells listeners once', async () => {
    const listener = vi.fn()
    subscribeBundledTerminalFontSettled(listener)

    expect(terminalFontFamilyReadyForMeasure('D2Coding')).toBe('')
    expect(terminalFontFamilyReadyForMeasure('D2Coding')).toBe('')
    expect(load).toHaveBeenCalledTimes(2)
    expect(load.mock.calls.map(([font]) => font)).toEqual([
      '400 16px "D2Coding"',
      '700 16px "D2Coding"'
    ])

    resolveLoad()
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
    expect(terminalFontFamilyReadyForMeasure('D2Coding')).toBe('D2Coding')
  })

  it('still applies the family when the load fails', async () => {
    load.mockReturnValue(Promise.reject(new Error('missing')))
    const listener = vi.fn()
    subscribeBundledTerminalFontSettled(listener)

    expect(terminalFontFamilyReadyForMeasure('D2Coding')).toBe('')
    await vi.waitFor(() => expect(listener).toHaveBeenCalled())
    expect(terminalFontFamilyReadyForMeasure('D2Coding')).toBe('D2Coding')
  })
})
