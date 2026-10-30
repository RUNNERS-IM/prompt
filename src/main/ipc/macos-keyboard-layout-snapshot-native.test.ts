import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { loadPromptNativeMock } = vi.hoisted(() => ({ loadPromptNativeMock: vi.fn() }))

vi.mock('../prompt-native', () => ({ loadPromptNative: () => loadPromptNativeMock() }))

const originalPlatform = process.platform

async function readSnapshot() {
  vi.resetModules()
  const { readMacKeyboardLayoutSnapshot } = await import('./macos-keyboard-layout-snapshot')
  return readMacKeyboardLayoutSnapshot()
}

describe('readMacKeyboardLayoutSnapshot', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    loadPromptNativeMock.mockReset()
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('parses the native module JSON, which leaves out characters a key does not type', async () => {
    const json = JSON.stringify({
      inputSourceId: 'com.apple.inputmethod.Korean.2SetKorean',
      layoutSourceId: 'com.apple.keylayout.2SetHangul',
      keyCharacters: { Digit2: { unmodified: '2', shifted: '@' }, IntlYen: {} }
    })
    loadPromptNativeMock.mockReturnValue({ keyboardLayoutSnapshot: () => json })

    await expect(readSnapshot()).resolves.toEqual({
      inputSourceId: 'com.apple.inputmethod.Korean.2SetKorean',
      layoutSourceId: 'com.apple.keylayout.2SetHangul',
      keyCharacters: {
        Digit2: { unmodified: '2', shifted: '@' },
        IntlYen: { unmodified: null, shifted: null }
      }
    })
  })

  it('returns null when the module cannot load, cannot read, or throws', async () => {
    loadPromptNativeMock.mockReturnValue(null)
    await expect(readSnapshot()).resolves.toBeNull()

    loadPromptNativeMock.mockReturnValue({ keyboardLayoutSnapshot: () => null })
    await expect(readSnapshot()).resolves.toBeNull()

    loadPromptNativeMock.mockReturnValue({
      keyboardLayoutSnapshot: () => {
        throw new Error('missing export')
      }
    })
    await expect(readSnapshot()).resolves.toBeNull()
  })

  it('does not ask on other platforms', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })

    await expect(readSnapshot()).resolves.toBeNull()
    expect(loadPromptNativeMock).not.toHaveBeenCalled()
  })
})
