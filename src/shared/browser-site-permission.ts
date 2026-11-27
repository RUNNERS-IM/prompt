/** What a site in the built-in browser can ask for, in the order prompts and settings list them. */
// 카메라 · 마이크 · 위치는 앱 권한에서 뺐으므로 사이트에도 묻지 않고 거절한다(2026-11-27 사용자: 「위치는 왜 필요한지 모르겠어」).
export const BROWSER_SITE_PERMISSIONS = [
  'notifications',
  'clipboard',
  'midi',
  'window-management',
  'idle-detection',
  'local-network'
] as const

export type BrowserSitePermission = (typeof BROWSER_SITE_PERMISSIONS)[number]

/** Every local file shares one site, as in Chrome; a file page's web origin is opaque. */
export const BROWSER_SITE_PERMISSION_LOCAL_FILES_ORIGIN = 'file://'

/** A remembered answer; a permission with none is asked again. */
export type BrowserSitePermissionDecision = 'allow' | 'block'

/** A site asks for one or more permissions at once. */
export type BrowserSitePermissionPrompt = {
  /** Origin of the page in the tab, e.g. `https://meet.google.com`. */
  origin: string
  permissions: BrowserSitePermission[]
}

/** Every remembered answer for one site in one browser profile. */
export type BrowserSitePermissionEntry = {
  origin: string
  decisions: Partial<Record<BrowserSitePermission, BrowserSitePermissionDecision>>
}

export function isBrowserSitePermission(value: unknown): value is BrowserSitePermission {
  return BROWSER_SITE_PERMISSIONS.some((permission) => permission === value)
}

export function isBrowserSitePermissionDecision(
  value: unknown
): value is BrowserSitePermissionDecision {
  return value === 'allow' || value === 'block'
}
