import { describe, expect, it, vi } from 'vitest'

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined) }
}))
vi.mock('expo-localization', () => ({ getLocales: () => [] }))

const { readSavedMobileUiLanguage } = await import('./ui-language-preference')

describe('readSavedMobileUiLanguage', () => {
  it('reads names saved before the 20-language set under their new names', () => {
    expect(readSavedMobileUiLanguage('zh')).toBe('zh-Hans')
    expect(readSavedMobileUiLanguage('pt-BR')).toBe('pt')
  })

  it('keeps current names, System and the new languages as they are', () => {
    expect(readSavedMobileUiLanguage('zh-Hant')).toBe('zh-Hant')
    expect(readSavedMobileUiLanguage('ar')).toBe('ar')
    expect(readSavedMobileUiLanguage('vi')).toBe('vi')
    expect(readSavedMobileUiLanguage('system')).toBe('system')
  })

  it('ignores anything else so the phone language applies', () => {
    expect(readSavedMobileUiLanguage('klingon')).toBeNull()
    expect(readSavedMobileUiLanguage(null)).toBeNull()
  })
})
