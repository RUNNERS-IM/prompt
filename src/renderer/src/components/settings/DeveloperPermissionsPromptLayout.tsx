import { RefreshCw } from 'lucide-react'
import type { DeveloperPermissionId } from '../../../../shared/developer-permissions-types'
import { Button } from '../ui/button'
import { translate } from '@/i18n/i18n'
import { PROMPT_SIMPLE_SETTINGS } from '@/lib/prompt-hidden-settings'
import { SettingsSubsectionHeader } from './SettingsFormControls'

// Prompt runs Claude sessions only; voice, webcam and hardware-device permissions have no use there.
const PROMPT_HIDDEN_PERMISSION_IDS: ReadonlySet<DeveloperPermissionId> = new Set([
  'microphone',
  'camera',
  'usb',
  'bluetooth'
])

export function promptVisibleDeveloperPermissions<T extends { id: DeveloperPermissionId }>(
  permissions: T[]
): T[] {
  return PROMPT_SIMPLE_SETTINGS
    ? permissions.filter((permission) => !PROMPT_HIDDEN_PERMISSION_IDS.has(permission.id))
    : permissions
}

// Prompt: the rows are one settings box, which already draws the border and pads each row.
export const DEVELOPER_PERMISSION_LIST_CLASS = PROMPT_SIMPLE_SETTINGS
  ? undefined
  : 'divide-y divide-border/60 rounded-lg border border-border/60'
export const DEVELOPER_PERMISSION_ROW_PADDING_CLASS = PROMPT_SIMPLE_SETTINGS ? '' : 'px-4 py-3'

/** Prompt: the permissions page sits under Advanced, so its rows open with this box title. */
export function PermissionsHeader(props: {
  loading: boolean
  onRefresh: () => void
}): React.JSX.Element | null {
  if (!PROMPT_SIMPLE_SETTINGS) {
    return null
  }
  return (
    <SettingsSubsectionHeader
      title={translate('prompt.settings.advanced.permissionsGroup', 'macOS permissions')}
      description={translate(
        'auto.components.settings.DeveloperPermissionsPane.6326a4c5cc',
        'Use these controls when a CLI, local app, or automation tool needs macOS privacy access. Orca does not ask at startup.'
      )}
      action={
        <Button variant="outline" size="sm" className="gap-1.5" onClick={props.onRefresh}>
          <RefreshCw className={`size-3.5 ${props.loading ? 'animate-spin' : ''}`} />
          {translate('auto.components.settings.DeveloperPermissionsPane.4c17304beb', 'Refresh')}
        </Button>
      }
    />
  )
}
