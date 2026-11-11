// Share renderer/mobile countdown copy without platform imports.

export type ResetDurationParts =
  | { unit: 'days'; days: number; hours: number }
  | { unit: 'hours'; hours: number; minutes: number }
  | { unit: 'minutes'; minutes: number }

/** Floored whole units so callers can render them in their own language; null when already due. */
export function getResetDurationParts(ms: number): ResetDurationParts | null {
  if (ms <= 0) {
    return null
  }
  const totalMins = Math.floor(ms / 60_000)
  if (totalMins < 60) {
    return { unit: 'minutes', minutes: totalMins }
  }
  const hours = Math.floor(totalMins / 60)
  if (hours >= 24) {
    return { unit: 'days', days: Math.floor(hours / 24), hours: hours % 24 }
  }
  return { unit: 'hours', hours, minutes: totalMins % 60 }
}

/** Floor durations to whole units (47m, 3h 54m, 6d 7h); nonpositive values return now for reset-specific copy. */
export function formatResetDuration(ms: number): string {
  const parts = getResetDurationParts(ms)
  if (parts === null) {
    return 'now'
  }
  if (parts.unit === 'minutes') {
    return `${parts.minutes}m`
  }
  if (parts.unit === 'days') {
    return parts.hours > 0 ? `${parts.days}d ${parts.hours}h` : `${parts.days}d`
  }
  return parts.minutes > 0 ? `${parts.hours}h ${parts.minutes}m` : `${parts.hours}h`
}

/** "Resets in 3h 54m" / "Resets now" for a window's time-until-reset (ms). */
export function formatResetCountdown(ms: number): string {
  const duration = formatResetDuration(ms)
  return duration === 'now' ? 'Resets now' : `Resets in ${duration}`
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** Schedule just past the next floored minute/hour label boundary, not every second; choose the earliest delay across future resets. */
export function getResetCountdownNextTickDelay(
  now: number,
  resetTimes: readonly number[]
): number | null {
  let nextDelay: number | null = null
  for (const resetAt of resetTimes) {
    if (!Number.isFinite(resetAt) || resetAt <= now) {
      continue
    }
    const remainingMs = resetAt - now
    const tickUnitMs = remainingMs >= DAY_MS ? HOUR_MS : MINUTE_MS
    // Why: +1ms so the timeout fires just past the boundary the label flips on.
    const delayMs = (remainingMs % tickUnitMs) + 1
    nextDelay = nextDelay === null ? delayMs : Math.min(nextDelay, delayMs)
  }
  return nextDelay
}
