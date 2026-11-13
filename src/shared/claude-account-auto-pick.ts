import type { ProviderRateLimits, RateLimitWindow } from './rate-limit-types'

export type ClaudeAutoPickCandidate = {
  accountId: string
  limits: ProviderRateLimits | null
}

/** A window that already reset counts as empty, whatever its last reading said. */
function isFull(window: RateLimitWindow | null, now: number): boolean {
  if (!window || (window.resetsAt !== null && window.resetsAt <= now)) {
    return false
  }
  return window.usedPercent >= 100
}

/** Unknown or past weekly resets sort last, so a known nearer reset always wins. */
function weeklyResetKey(limits: ProviderRateLimits, now: number): number {
  const resetsAt = limits.weekly?.resetsAt ?? null
  return resetsAt !== null && resetsAt > now ? resetsAt : Number.POSITIVE_INFINITY
}

/**
 * Among accounts with room in both the 5-hour and weekly windows, use the one whose weekly window
 * resets soonest, so its remaining allowance is spent before it would be thrown away. An account
 * without a weekly reading is skipped: its room cannot be judged. Ties keep the current account,
 * and with no account to use the current one stays.
 */
export function pickClaudeAccountBySoonestReset(
  candidates: readonly ClaudeAutoPickCandidate[],
  currentAccountId: string | null,
  now: number
): string | null {
  let best: { accountId: string; key: number } | null = null
  for (const { accountId, limits } of candidates) {
    if (!limits?.weekly || isFull(limits.session, now) || isFull(limits.weekly, now)) {
      continue
    }
    const key = weeklyResetKey(limits, now)
    if (!best || key < best.key || (key === best.key && accountId === currentAccountId)) {
      best = { accountId, key }
    }
  }
  return best?.accountId ?? currentAccountId
}
