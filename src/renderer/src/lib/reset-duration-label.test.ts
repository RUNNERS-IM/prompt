import { afterEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n/i18n'
import ko from '@/i18n/locales/ko.json'
import { formatLocalizedResetCountdown } from './reset-duration-label'

const originalLanguage = i18n.language

afterEach(async () => {
  await i18n.changeLanguage(originalLanguage)
})

describe('formatLocalizedResetCountdown', () => {
  it('uses the Korean unit words on a Korean screen, like the mobile accounts screen', async () => {
    i18n.addResourceBundle('ko', 'translation', ko)
    await i18n.changeLanguage('ko')
    expect(formatLocalizedResetCountdown((3 * 24 + 19) * 60 * 60_000)).toBe('3일 19시간 후 초기화')
    expect(formatLocalizedResetCountdown((3 * 60 + 54) * 60_000)).toBe('3시간 54분 후 초기화')
    expect(formatLocalizedResetCountdown(0)).toBe('곧 초기화')
  })
})
