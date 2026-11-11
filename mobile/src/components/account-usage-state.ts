// Keep shapes aligned with shared types/rate-limit-types without pulling Electron-coupled desktop graph into mobile.
// Pure RN-free selectors stay directly testable; AccountUsage re-exports them with UsageBar.
import {
  getResetDurationParts,
  type ResetDurationParts
} from '../../../src/shared/rate-limit-reset-format'
import type { Translate } from '../i18n/mobile-i18n'
import type {
  AccountsSnapshot,
  InactiveAccountUsage,
  ProviderRateLimits
} from './accounts-snapshot'

export {
  AccountsSnapshotSchema,
  decodeAccountsSnapshot,
  ProviderRateLimitsSchema,
  RateLimitRuntimeTargetSchema,
  type AccountsSnapshot,
  type ClaudeAccountSummary,
  type CodexAccountSummary,
  type InactiveAccountUsage,
  type ProviderRateLimits,
  type RateLimitRuntimeTarget,
  type RateLimitWindow
} from './accounts-snapshot'

export type ProviderKey = 'claude' | 'codex'

export type UsageBarState = {
  usedPercent: number | null
  unavailable: boolean
  loading: boolean
  hidden: boolean
}

export function getActiveProviderRateLimits(
  snapshot: AccountsSnapshot,
  provider: ProviderKey
): ProviderRateLimits | null {
  return provider === 'claude' ? snapshot.rateLimits.claude : snapshot.rateLimits.codex
}

export function getInactiveProviderUsage(
  snapshot: AccountsSnapshot,
  provider: ProviderKey,
  accountId: string
): InactiveAccountUsage | null {
  const list =
    provider === 'claude'
      ? snapshot.rateLimits.inactiveClaudeAccounts
      : snapshot.rateLimits.inactiveCodexAccounts
  return list.find((u) => u.accountId === accountId) ?? null
}

// System-default logins still fetch quota without managed accounts. Show successful provider or any window data; empty unavailable/error means no credentials.
export function hasActiveProviderUsage(limits: ProviderRateLimits | null): boolean {
  if (!limits) {
    return false
  }
  if (
    limits.session != null ||
    limits.weekly != null ||
    limits.monthly != null ||
    (limits.buckets && limits.buckets.length > 0)
  ) {
    return true
  }
  return limits.status === 'ok'
}

// Determine availability per window because transient provider errors retain successful window data.
export function getUsageBarState(
  limits: ProviderRateLimits | null,
  windowKey: 'session' | 'weekly',
  isFetchingOverride?: boolean
): UsageBarState {
  const window = limits?.[windowKey] ?? null
  const fetching =
    isFetchingOverride ?? (limits?.status === 'fetching' || limits?.status === 'idle')
  return {
    usedPercent: window?.usedPercent ?? null,
    unavailable: window == null && !fetching,
    loading: fetching && window == null,
    hidden: windowKey === 'session' && !showsSessionWindow(limits)
  }
}

// Plans without a 5-hour cap report only the weekly window; an empty 5h row would read as unused quota.
export function showsSessionWindow(limits: ProviderRateLimits | null): boolean {
  return limits?.session != null || limits?.weekly == null
}

// Desktop duration rounding with translated unit words; return null without reset timestamp to retain bars-only UI.
export function getWindowResetLabel(
  limits: ProviderRateLimits | null,
  windowKey: 'session' | 'weekly',
  now: number,
  t: Translate
): string | null {
  const resetsAt = limits?.[windowKey]?.resetsAt
  if (resetsAt == null) {
    return null
  }
  const parts = getResetDurationParts(resetsAt - now)
  if (parts === null) {
    return t('accounts.screen.resetsNow', 'Resets now')
  }
  const duration = formatResetDurationParts(parts, t)
  return t('accounts.screen.resetsIn', 'Resets in {{duration}}', { duration })
}

function formatResetDurationParts(parts: ResetDurationParts, t: Translate): string {
  if (parts.unit === 'minutes') {
    return t('accounts.screen.durationMinutes', '{{minutes}}m', { minutes: parts.minutes })
  }
  if (parts.unit === 'days') {
    return parts.hours > 0
      ? t('accounts.screen.durationDaysHours', '{{days}}d {{hours}}h', parts)
      : t('accounts.screen.durationDays', '{{days}}d', { days: parts.days })
  }
  return parts.minutes > 0
    ? t('accounts.screen.durationHoursMinutes', '{{hours}}h {{minutes}}m', parts)
    : t('accounts.screen.durationHours', '{{hours}}h', { hours: parts.hours })
}

// Show provider with managed accounts or active system-default quota; management is not required for usage UI.
export function hasRenderableUsage(snapshot: AccountsSnapshot, provider: ProviderKey): boolean {
  const accounts = provider === 'claude' ? snapshot.claude.accounts : snapshot.codex.accounts
  if (accounts.length > 0) {
    return true
  }
  return hasActiveProviderUsage(getActiveProviderRateLimits(snapshot, provider))
}
