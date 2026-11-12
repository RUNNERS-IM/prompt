import { translate } from '@/i18n/i18n'
import {
  getResetDurationParts,
  type ResetDurationParts
} from '../../../shared/rate-limit-reset-format'

// Same unit words as the mobile accounts screen, so "3일 19시간 후 초기화" reads alike on both.
function formatParts(parts: ResetDurationParts): string {
  if (parts.unit === 'minutes') {
    return translate('prompt.usageReset.durationMinutes', '{{minutes}}m', {
      minutes: parts.minutes
    })
  }
  if (parts.unit === 'days') {
    return parts.hours > 0
      ? translate('prompt.usageReset.durationDaysHours', '{{days}}d {{hours}}h', {
          days: parts.days,
          hours: parts.hours
        })
      : translate('prompt.usageReset.durationDays', '{{days}}d', { days: parts.days })
  }
  return parts.minutes > 0
    ? translate('prompt.usageReset.durationHoursMinutes', '{{hours}}h {{minutes}}m', {
        hours: parts.hours,
        minutes: parts.minutes
      })
    : translate('prompt.usageReset.durationHours', '{{hours}}h', { hours: parts.hours })
}

/** Remaining time in the UI language ("3d 19h", "3일 19시간"); null once the reset is due. */
export function formatLocalizedResetDuration(ms: number): string | null {
  const parts = getResetDurationParts(ms)
  return parts === null ? null : formatParts(parts)
}

/** "Resets in 3d 19h" / "Resets now" in the UI language. */
export function formatLocalizedResetCountdown(ms: number): string {
  const duration = formatLocalizedResetDuration(ms)
  return duration === null
    ? translate('prompt.usageReset.resetsNow', 'Resets now')
    : translate('prompt.usageReset.resetsIn', 'Resets in {{duration}}', { duration })
}
