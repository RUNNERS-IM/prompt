export const UI_LANGUAGE_SYSTEM = 'system'
export const UI_LANGUAGE_ENGLISH = 'en'
export const UI_LANGUAGE_CHINESE = 'zh-Hans'
// Why: a script subtag, not a region — zh-Hant also serves zh-TW/zh-HK/zh-MO users.
export const UI_LANGUAGE_CHINESE_TRADITIONAL = 'zh-Hant'
export const UI_LANGUAGE_KOREAN = 'ko'
export const UI_LANGUAGE_JAPANESE = 'ja'
export const UI_LANGUAGE_SPANISH = 'es'
export const UI_LANGUAGE_FRENCH = 'fr'
export const UI_LANGUAGE_PORTUGUESE = 'pt'
export const UI_LANGUAGE_RUSSIAN = 'ru'
export const UI_LANGUAGE_TURKISH = 'tr'
export const UI_LANGUAGE_GERMAN = 'de'
export const UI_LANGUAGE_ARABIC = 'ar'
export const UI_LANGUAGE_FINNISH = 'fi'
export const UI_LANGUAGE_HINDI = 'hi'
export const UI_LANGUAGE_INDONESIAN = 'id'
export const UI_LANGUAGE_ITALIAN = 'it'
export const UI_LANGUAGE_DUTCH = 'nl'
export const UI_LANGUAGE_POLISH = 'pl'
export const UI_LANGUAGE_THAI = 'th'
export const UI_LANGUAGE_VIETNAMESE = 'vi'

export type BuiltInUiLanguage =
  | typeof UI_LANGUAGE_SYSTEM
  | typeof UI_LANGUAGE_ENGLISH
  | typeof UI_LANGUAGE_CHINESE
  | typeof UI_LANGUAGE_CHINESE_TRADITIONAL
  | typeof UI_LANGUAGE_KOREAN
  | typeof UI_LANGUAGE_JAPANESE
  | typeof UI_LANGUAGE_SPANISH
  | typeof UI_LANGUAGE_FRENCH
  | typeof UI_LANGUAGE_PORTUGUESE
  | typeof UI_LANGUAGE_RUSSIAN
  | typeof UI_LANGUAGE_TURKISH
  | typeof UI_LANGUAGE_GERMAN
  | typeof UI_LANGUAGE_ARABIC
  | typeof UI_LANGUAGE_FINNISH
  | typeof UI_LANGUAGE_HINDI
  | typeof UI_LANGUAGE_INDONESIAN
  | typeof UI_LANGUAGE_ITALIAN
  | typeof UI_LANGUAGE_DUTCH
  | typeof UI_LANGUAGE_POLISH
  | typeof UI_LANGUAGE_THAI
  | typeof UI_LANGUAGE_VIETNAMESE

export type PluginUiLanguage = `plugin:${string}`
export type UiLanguage = BuiltInUiLanguage | PluginUiLanguage

// Each language in its own script, so someone stuck in a language they cannot read can find theirs.
export const UI_LANGUAGE_NATIVE_NAMES: Record<BuiltInUiLanguage, string> = {
  [UI_LANGUAGE_SYSTEM]: 'System',
  [UI_LANGUAGE_ENGLISH]: 'English',
  [UI_LANGUAGE_CHINESE]: '中文（简体）',
  [UI_LANGUAGE_CHINESE_TRADITIONAL]: '繁體中文（台灣）',
  [UI_LANGUAGE_KOREAN]: '한국어',
  [UI_LANGUAGE_JAPANESE]: '日本語',
  [UI_LANGUAGE_SPANISH]: 'Español',
  [UI_LANGUAGE_FRENCH]: 'Français',
  [UI_LANGUAGE_PORTUGUESE]: 'Português (Brasil)',
  [UI_LANGUAGE_RUSSIAN]: 'Русский',
  [UI_LANGUAGE_TURKISH]: 'Türkçe',
  [UI_LANGUAGE_GERMAN]: 'Deutsch',
  [UI_LANGUAGE_ARABIC]: 'العربية',
  [UI_LANGUAGE_FINNISH]: 'Suomi',
  [UI_LANGUAGE_HINDI]: 'हिन्दी',
  [UI_LANGUAGE_INDONESIAN]: 'Bahasa Indonesia',
  [UI_LANGUAGE_ITALIAN]: 'Italiano',
  [UI_LANGUAGE_DUTCH]: 'Nederlands',
  [UI_LANGUAGE_POLISH]: 'Polski',
  [UI_LANGUAGE_THAI]: 'ไทย',
  [UI_LANGUAGE_VIETNAMESE]: 'Tiếng Việt'
}

const UI_LANGUAGE_VALUES = new Set<BuiltInUiLanguage>([
  UI_LANGUAGE_SYSTEM,
  UI_LANGUAGE_ENGLISH,
  UI_LANGUAGE_CHINESE,
  UI_LANGUAGE_CHINESE_TRADITIONAL,
  UI_LANGUAGE_KOREAN,
  UI_LANGUAGE_JAPANESE,
  UI_LANGUAGE_SPANISH,
  UI_LANGUAGE_FRENCH,
  UI_LANGUAGE_PORTUGUESE,
  UI_LANGUAGE_RUSSIAN,
  UI_LANGUAGE_TURKISH,
  UI_LANGUAGE_GERMAN,
  UI_LANGUAGE_ARABIC,
  UI_LANGUAGE_FINNISH,
  UI_LANGUAGE_HINDI,
  UI_LANGUAGE_INDONESIAN,
  UI_LANGUAGE_ITALIAN,
  UI_LANGUAGE_DUTCH,
  UI_LANGUAGE_POLISH,
  UI_LANGUAGE_THAI,
  UI_LANGUAGE_VIETNAMESE
])

const PLUGIN_UI_LANGUAGE_RE =
  /^plugin:[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i

export function isPluginUiLanguage(value: unknown): value is PluginUiLanguage {
  return typeof value === 'string' && PLUGIN_UI_LANGUAGE_RE.test(value)
}

export function normalizeUiLanguage(value: unknown): UiLanguage {
  if (isPluginUiLanguage(value)) {
    return value
  }
  // Prompt: Simplified Chinese was stored as 'zh' before the 20-language set used script codes.
  if (value === 'zh') {
    return UI_LANGUAGE_CHINESE
  }
  return UI_LANGUAGE_VALUES.has(value as BuiltInUiLanguage)
    ? (value as BuiltInUiLanguage)
    : UI_LANGUAGE_SYSTEM
}
