import { app } from 'electron'
import { detectUiLanguage, type UiLanguageDetection } from '../../shared/ui-locale'
import { normalizeUiLanguage, UI_LANGUAGE_KOREAN, UI_LANGUAGE_SYSTEM } from '../../shared/ui-language'

let snapshot: UiLanguageDetection | null | undefined

export function getSystemLanguageDetection(
  browserPreferences?: readonly string[]
): UiLanguageDetection | null {
  if (snapshot === undefined) {
    try {
      if (!app.isReady()) {
        // Pre-ready startup-failure dialogs still need a language; cache only the post-ready read.
        return readNativeLanguageDetection()
      }
      snapshot = readNativeLanguageDetection()
    } catch {
      snapshot = null
    }
  }
  if (snapshot === null && browserPreferences) {
    snapshot = detectUiLanguage(browserPreferences, 'browser-fallback')
  }
  return snapshot
}

function readNativeLanguageDetection(): UiLanguageDetection | null {
  try {
    const preferences = app.getPreferredSystemLanguages()
    return preferences.length ? detectUiLanguage(preferences, 'native') : null
  } catch {
    return null
  }
}

/** Whether the stored UI language shows Korean, following the system language when it is "system". */
export function isKoreanUiLanguage(uiLanguage: unknown): boolean {
  const language = normalizeUiLanguage(uiLanguage)
  if (language === UI_LANGUAGE_KOREAN) {
    return true
  }
  return language === UI_LANGUAGE_SYSTEM && getSystemLanguageDetection()?.locale === UI_LANGUAGE_KOREAN
}
