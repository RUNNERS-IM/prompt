import type React from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { isPromptRestoreProjectWindowsOn } from '../../../../shared/prompt-project-windows'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitchRow } from './SettingsFormControls'
import { translate } from '@/i18n/i18n'

/** Prompt: reopen the project windows that were open at quit ("Remember Open Windows"). */
export function PromptProjectWindowsSetting({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const title = translate('prompt.projectWindow.rememberTitle', 'Remember Open Windows')
  const description = translate(
    'prompt.projectWindow.rememberDescription',
    'Reopen project windows that were open when Prompt quit.'
  )
  const on = isPromptRestoreProjectWindowsOn(settings)
  return (
    <SearchableSetting
      title={title}
      description={description}
      keywords={['window', 'project', 'restore', 'reopen', '창', '기억']}
    >
      <SettingsSwitchRow
        label={title}
        description={description}
        checked={on}
        onChange={() => updateSettings({ promptRestoreProjectWindows: !on })}
      />
    </SearchableSetting>
  )
}
