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

/** The 5-hour or weekly window is used up and has not reset yet; no reading means not known to be full. */
export function isClaudeLimitsFull(limits: ProviderRateLimits | null, now: number): boolean {
  return !!limits && (isFull(limits.session, now) || isFull(limits.weekly, now))
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

/**
 * When a full account has room again: the latest reset among its full windows, since both must
 * free up. Null when it is not full or a full window has no known reset.
 */
export function claudeLimitsFreeAt(limits: ProviderRateLimits | null, now: number): number | null {
  if (!limits) {
    return null
  }
  const full = [limits.session, limits.weekly].filter(
    (window): window is RateLimitWindow => window !== null && isFull(window, now)
  )
  if (full.length === 0 || full.some((window) => window.resetsAt === null)) {
    return null
  }
  return Math.max(...full.map((window) => window.resetsAt as number))
}

/**
 * The next reset of any window still ahead. Used for an account a stopped session reported as full
 * before its usage reading shows 100%: which window ran out is not known, so the nearer one is tried.
 */
export function claudeLimitsNextResetAt(
  limits: ProviderRateLimits | null,
  now: number
): number | null {
  const ahead = [limits?.session?.resetsAt ?? null, limits?.weekly?.resetsAt ?? null].filter(
    (resetsAt): resetsAt is number => resetsAt !== null && resetsAt > now
  )
  return ahead.length > 0 ? Math.min(...ahead) : null
}
