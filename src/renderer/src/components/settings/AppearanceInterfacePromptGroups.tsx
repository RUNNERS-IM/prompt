import type React from 'react'
import { Fragment } from 'react'

import { useAppStore } from '../../store'
import { SettingsSubsectionHeader } from './SettingsFormControls'
import {
  getLanguageEntries,
  getMenuBarIconEntries,
  getSystemTrayEntries,
  getThemeEntries,
  getTypographyEntries,
  getZoomEntries
} from './appearance-search'
import { SHOW_UI_LANGUAGE_SETTING } from '@/i18n/supported-languages'
import { translate } from '@/i18n/i18n'
import { matchesSettingsSearch, normalizeSettingsSearchQuery } from './settings-search'

type AppearanceInterfacePromptGroupsProps = {
  isDesktopMac: boolean
  isDesktopWindows: boolean
  forceVisiblePrimary: boolean
  primaryRows: React.ReactNode[]
  windowRows: React.ReactNode[]
}

// Prompt: the Interface rows as two titled boxes, without plugin theme rows or the Orca titlebar name.
export function AppearanceInterfacePromptGroups({
  isDesktopMac,
  isDesktopWindows,
  forceVisiblePrimary,
  primaryRows,
  windowRows
}: AppearanceInterfacePromptGroupsProps): React.JSX.Element {
  const searchQuery = useAppStore((state) => state.settingsSearchQuery)
  const isSearching = normalizeSettingsSearchQuery(searchQuery).length > 0
  const showPrimary =
    !isSearching ||
    forceVisiblePrimary ||
    matchesSettingsSearch(searchQuery, [
      ...getThemeEntries(),
      ...(SHOW_UI_LANGUAGE_SETTING ? getLanguageEntries() : []),
      ...getZoomEntries(),
      ...getTypographyEntries()
    ])
  const showWindowGroup =
    (isDesktopMac || isDesktopWindows) &&
    (!isSearching ||
      matchesSettingsSearch(searchQuery, [
        ...getSystemTrayEntries({ showSystemTray: isDesktopWindows }),
        ...getMenuBarIconEntries({ showMenuBarIcon: isDesktopMac })
      ]))

  return (
    <>
      {showPrimary ? (
        <section>
          <SettingsSubsectionHeader
            title={translate('auto.components.settings.AppearancePane.interfaceTitle', 'Interface')}
          />
          {primaryRows.map((row, index) => (
            <Fragment key={index}>{row}</Fragment>
          ))}
        </section>
      ) : null}
      {showWindowGroup ? (
        <section>
          <SettingsSubsectionHeader
            title={
              isDesktopMac
                ? translate('prompt.settings.appearance.menuBarGroup', 'Menu Bar')
                : translate('prompt.settings.appearance.trayGroup', 'System Tray')
            }
          />
          {windowRows.map((row, index) => (
            <Fragment key={index}>{row}</Fragment>
          ))}
        </section>
      ) : null}
    </>
  )
}
