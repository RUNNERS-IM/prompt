import type { SupportedUiLocale } from '../../../src/shared/ui-locale'
import { getMobileUiLocale } from './mobile-i18n'

// Explicit script/region: Hermes passes tags to the platform formatter, which reads bare `zh` and `pt` differently by OS.
const INTL_LOCALE: Record<SupportedUiLocale, string> = {
  en: 'en',
  ar: 'ar',
  de: 'de',
  es: 'es',
  fi: 'fi',
  fr: 'fr',
  hi: 'hi',
  id: 'id',
  it: 'it',
  ja: 'ja',
  ko: 'ko',
  nl: 'nl',
  pl: 'pl',
  pt: 'pt-BR',
  ru: 'ru',
  th: 'th',
  tr: 'tr',
  vi: 'vi',
  'zh-Hans': 'zh-Hans',
  'zh-Hant': 'zh-Hant'
}

export function intlLocaleFor(locale: SupportedUiLocale): string {
  return INTL_LOCALE[locale]
}

// Format dates and numbers in the UI language, not the platform default (`undefined`).
export function getUiIntlLocale(): string {
  return INTL_LOCALE[getMobileUiLocale()]
}
