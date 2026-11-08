import { DEFAULT_APP_FONT_FAMILY } from '../../../shared/constants'

// Design system font; a setting still on the upstream default counts as untouched.
const PROMPT_DEFAULT_APP_FONT_FAMILY = 'Pretendard'

const APP_FONT_FALLBACKS = [
  DEFAULT_APP_FONT_FAMILY,
  '-apple-system',
  'BlinkMacSystemFont',
  'Segoe UI',
  'sans-serif'
] as const

const CSS_FONT_KEYWORDS = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'blinkmacsystemfont'
])

function quoteFontFamily(fontFamily: string): string {
  if (fontFamily.startsWith('-') || CSS_FONT_KEYWORDS.has(fontFamily.toLowerCase())) {
    return fontFamily
  }
  return JSON.stringify(fontFamily)
}

export function buildAppFontFamily(fontFamily: string | null | undefined): string {
  const saved = fontFamily?.trim()
  const trimmed =
    !saved || saved === DEFAULT_APP_FONT_FAMILY ? PROMPT_DEFAULT_APP_FONT_FAMILY : saved
  const lowerTrimmed = trimmed.toLowerCase()
  const parts = [
    trimmed,
    ...APP_FONT_FALLBACKS.filter((fallback) => fallback.toLowerCase() !== lowerTrimmed)
  ]
  return parts.map(quoteFontFamily).join(', ')
}
