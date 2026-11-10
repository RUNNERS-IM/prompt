import type React from 'react'
import { useEffect, useState } from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { isAutomaticUpdateCheckOn } from '../../../../shared/automatic-update-check'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSubsectionHeader, SettingsSwitchRow } from './SettingsFormControls'
import { getPromptGeneralAppSearchEntries, isPromptDesktopMac } from './prompt-general-app-search'

function useOpenAtLogin(enabled: boolean): [boolean | null, () => void] {
  const [on, setOn] = useState<boolean | null>(null)
  useEffect(() => {
    if (!enabled) {
      return
    }
    let alive = true
    void window.api.app
      .getOpenAtLogin?.()
      .then((value) => {
        if (alive) {
          setOn(value)
        }
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [enabled])
  const toggle = (): void => {
    if (on === null) {
      return
    }
    setOn(!on)
    // macOS 가 거절할 수 있어 바꾼 뒤 알려 준 값을 다시 보인다.
    void window.api.app
      .setOpenAtLogin?.(!on)
      .then(setOn)
      .catch(() => undefined)
  }
  return [on, toggle]
}

export function PromptGeneralAppSettingsSection({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const mac = isPromptDesktopMac()
  const [openAtLogin, toggleOpenAtLogin] = useOpenAtLogin(mac)
  const entries = getPromptGeneralAppSearchEntries()
  const autoCheckEntry = entries[mac ? 1 : 0]
  const openAtLoginEntry = mac ? entries[0] : undefined
  const menuBarEntry = mac ? entries[2] : undefined

  return (
    <section className="space-y-4">
      <SettingsSubsectionHeader title={translate('prompt.settings.general.appGroup', 'App')} />
      {openAtLoginEntry ? (
        <SearchableSetting {...openAtLoginEntry}>
          <SettingsSwitchRow
            label={openAtLoginEntry.title}
            description={openAtLoginEntry.description}
            checked={openAtLogin === true}
            disabled={openAtLogin === null}
            onChange={toggleOpenAtLogin}
          />
        </SearchableSetting>
      ) : null}
      {autoCheckEntry ? (
        <SearchableSetting {...autoCheckEntry}>
          <SettingsSwitchRow
            label={autoCheckEntry.title}
            description={autoCheckEntry.description}
            checked={isAutomaticUpdateCheckOn(settings)}
            onChange={() =>
              updateSettings({ autoCheckUpdates: !isAutomaticUpdateCheckOn(settings) })
            }
          />
        </SearchableSetting>
      ) : null}
      {menuBarEntry ? (
        <SearchableSetting {...menuBarEntry}>
          <SettingsSwitchRow
            label={menuBarEntry.title}
            description={menuBarEntry.description}
            checked={settings.showMenuBarIcon !== false}
            onChange={() => updateSettings({ showMenuBarIcon: settings.showMenuBarIcon === false })}
          />
        </SearchableSetting>
      ) : null}
    </section>
  )
}
