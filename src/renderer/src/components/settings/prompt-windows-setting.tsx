import type React from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { isPromptRestoreWindowsOn } from '../../../../shared/prompt-windows'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitchRow } from './SettingsFormControls'
import { translate } from '@/i18n/i18n'

/** Prompt: reopen the windows that were open at quit, with their tabs ("Remember Open Windows"). */
export function PromptWindowsSetting({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const title = translate('prompt.windows.rememberTitle', 'Remember Open Windows')
  const description = translate(
    'prompt.windows.rememberDescription',
    'Reopen every window with its tabs, size and position when Prompt starts.'
  )
  const on = isPromptRestoreWindowsOn(settings)
  return (
    <SearchableSetting
      title={title}
      description={description}
      keywords={['window', 'restore', 'reopen', '창', '기억']}
    >
      <SettingsSwitchRow
        label={title}
        description={description}
        checked={on}
        onChange={() => updateSettings({ promptRestoreWindows: !on })}
      />
    </SearchableSetting>
  )
}
