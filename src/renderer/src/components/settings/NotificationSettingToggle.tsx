import type { ReactNode } from 'react'
import { Label } from '../ui/label'
import { Switch } from '../ui/switch'
import { cn } from '@/lib/utils'
import { PROMPT_SIMPLE_SETTINGS } from '@/lib/prompt-hidden-settings'

export type NotificationSettingToggleProps = {
  label: string
  description: string
  checked: boolean
  onToggle: () => void
  disabled?: boolean
  icon?: ReactNode
}

export function NotificationSettingToggle({
  label,
  description,
  checked,
  onToggle,
  disabled = false,
  icon
}: NotificationSettingToggleProps): React.JSX.Element {
  return (
    // Prompt: the same row as SettingsRow (13 / 11 text, 13 above and below).
    <div
      data-prompt-settings-row={PROMPT_SIMPLE_SETTINGS ? '' : undefined}
      className={cn(
        'flex items-center justify-between gap-4',
        PROMPT_SIMPLE_SETTINGS ? 'py-[13px]' : 'py-2'
      )}
    >
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          {icon}
          <Label className={PROMPT_SIMPLE_SETTINGS ? 'text-[13px] leading-4' : undefined}>
            {label}
          </Label>
        </div>
        <p
          className={cn(
            'text-muted-foreground',
            PROMPT_SIMPLE_SETTINGS ? 'text-[11px] leading-[14px]' : 'text-xs'
          )}
        >
          {description}
        </p>
      </div>
      <Switch checked={checked} aria-label={label} disabled={disabled} onCheckedChange={onToggle} />
    </div>
  )
}
