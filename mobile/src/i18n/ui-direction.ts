import type { SupportedUiLocale } from '../../../src/shared/ui-locale'
import { useMobileUiLocale } from './use-mobile-translation'

export type MobileUiDirection = 'ltr' | 'rtl'

export function uiDirectionFor(locale: SupportedUiLocale): MobileUiDirection {
  return locale === 'ar' ? 'rtl' : 'ltr'
}

// Same split as the desktop app (runners-wiki 2026-11-08, 2A): settings, pairing, onboarding and
// info screens follow Arabic right to left; Home's session list and every host screen (terminal,
// files, review) keep left to right, where paths, code and terminal output read that way.
export function isLeftToRightOnlyRoute(pathname: string): boolean {
  return pathname === '/' || pathname === '' || pathname === '/h' ||
    pathname.startsWith('/h/') || pathname.startsWith('/new-workspace')
}

export function routeDirection(locale: SupportedUiLocale, pathname: string): MobileUiDirection {
  return isLeftToRightOnlyRoute(pathname) ? 'ltr' : uiDirectionFor(locale)
}

export function useMobileUiDirection(): MobileUiDirection {
  return uiDirectionFor(useMobileUiLocale())
}

// Chevrons and arrows point the way the row reads, so they mirror under right to left.
export function mirroredInRtl(direction: MobileUiDirection): { transform: { scaleX: number }[] } | undefined {
  return direction === 'rtl' ? { transform: [{ scaleX: -1 }] } : undefined
}
