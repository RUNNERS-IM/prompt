import type { SettingsSearchEntry } from './settings-search'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getBrowserSitePermissionsSearchEntry = createLocalizedCatalog(
  (): SettingsSearchEntry => ({
    title: translate('settings.browser.sitePermissions.title', 'Site permissions'),
    description: translate(
      'settings.browser.sitePermissions.description',
      'Sites ask before showing notifications, reading the clipboard, reaching your local network and more. Change what you allowed or blocked for each site.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.browser.search.2d2d995c58', 'browser'),
      ...translateSearchKeyword(
        'settings.browser.sitePermissions.search.permissions',
        'permissions'
      ),
      ...translateSearchKeyword(
        'settings.browser.sitePermissions.search.notifications',
        'notifications'
      ),
      ...translateSearchKeyword('settings.browser.sitePermissions.search.clipboard', 'clipboard'),
      ...translateSearchKeyword(
        'settings.browser.sitePermissions.search.localNetwork',
        'local network'
      )
    ]
  })
)
