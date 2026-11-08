export type UiTextDirection = 'ltr' | 'rtl'

export function uiTextDirection(language: string | null | undefined): UiTextDirection {
  return language?.toLowerCase().split('-')[0] === 'ar' ? 'rtl' : 'ltr'
}
