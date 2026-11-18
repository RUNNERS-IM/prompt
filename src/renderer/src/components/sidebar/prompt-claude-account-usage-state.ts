import type { ProviderRateLimits, RateLimitWindow } from '../../../../shared/rate-limit-types'

// 계정 메뉴의 사용량 한 칸에 무엇을 보일지 정한다. 쉬는 계정은 읽기에 실패해도 이유를 버리지 않고,
// 마지막으로 읽은 숫자는 이 기기에 남겨 앱을 다시 켜도 흐리게 보인다.

const STORAGE_KEY = 'prompt.claudeAccountUsage.lastRead'

export type RememberedAccountUsage = {
  session: RateLimitWindow | null
  weekly: RateLimitWindow | null
  readAt: number
}

export type AccountUsageView =
  | { kind: 'empty' }
  | {
      kind: 'live'
      session: RateLimitWindow | null
      weekly: RateLimitWindow | null
    }
  | {
      kind: 'failed'
      reason: 'stale-token' | 'other'
      /** 실패 때 보일 마지막 숫자. 초기화 시각이 지난 칸은 뺀다. */
      session: RateLimitWindow | null
      weekly: RateLimitWindow | null
      lastReadAt: number | null
    }

function stillValid(
  window: RateLimitWindow | null | undefined,
  now: number
): RateLimitWindow | null {
  if (!window) {
    return null
  }
  // 초기화가 지난 칸의 숫자는 지금 쓴 양이 아니다.
  return window.resetsAt && window.resetsAt <= now ? null : window
}

export function describeAccountUsage(
  limits: ProviderRateLimits | null,
  remembered: RememberedAccountUsage | null,
  now: number
): AccountUsageView {
  const hasWindows = Boolean(limits?.session || limits?.weekly)
  if (!limits || limits.status !== 'error') {
    return hasWindows && limits
      ? { kind: 'live', session: limits.session, weekly: limits.weekly }
      : { kind: 'empty' }
  }
  const reason = limits.usageMetadata?.failureKind === 'stale-token' ? 'stale-token' : 'other'
  // 실패 직후에는 서비스가 바로 앞 숫자를 붙여 보내고(updatedAt 은 그 숫자를 읽은 때), 없으면 이 기기에 남긴 값을 쓴다.
  const source = hasWindows
    ? {
        session: limits.session,
        weekly: limits.weekly,
        readAt: limits.updatedAt
      }
    : remembered
  return {
    kind: 'failed',
    reason,
    session: stillValid(source?.session, now),
    weekly: stillValid(source?.weekly, now),
    lastReadAt: source && source.readAt > 0 ? source.readAt : null
  }
}

function readAll(): Record<string, RememberedAccountUsage> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return saved && typeof saved === 'object'
      ? (saved as Record<string, RememberedAccountUsage>)
      : {}
  } catch {
    return {}
  }
}

export function readRememberedAccountUsage(accountId: string): RememberedAccountUsage | null {
  const entry = readAll()[accountId]
  return entry && typeof entry.readAt === 'number' ? entry : null
}

/** 제대로 읽은 결과만 남긴다. 계정 id 와 숫자 · 시각만 쓰고 이메일 · 토큰은 쓰지 않는다. */
export function rememberAccountUsage(accountId: string, limits: ProviderRateLimits | null): void {
  if (!limits || limits.status !== 'ok' || !(limits.session || limits.weekly)) {
    return
  }
  const all = readAll()
  if (all[accountId]?.readAt === limits.updatedAt) {
    return
  }
  all[accountId] = {
    session: limits.session,
    weekly: limits.weekly,
    readAt: limits.updatedAt
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // 저장이 막혀도 메뉴는 지금 값으로 그린다.
  }
}

export function formatLastReadAt(readAt: number): string {
  const d = new Date(readAt)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
