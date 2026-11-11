import { describe, expect, it } from 'vitest'
import type { Translate } from '../i18n/mobile-i18n'
import koCatalog from '../i18n/locales/ko.json'

import {
  getInactiveProviderUsage,
  getUsageBarState,
  getWindowResetLabel,
  hasActiveProviderUsage,
  hasRenderableUsage,
  showsSessionWindow,
  type AccountsSnapshot,
  type InactiveAccountUsage,
  type ProviderRateLimits
} from './account-usage-state'

function makeLimits(overrides: Partial<ProviderRateLimits> = {}): ProviderRateLimits {
  return {
    provider: 'claude',
    session: null,
    weekly: null,
    monthly: null,
    updatedAt: 0,
    error: null,
    status: 'idle',
    ...overrides
  }
}

function makeSnapshot(
  overrides: {
    claudeLimits?: ProviderRateLimits | null
    codexLimits?: ProviderRateLimits | null
    claudeAccounts?: AccountsSnapshot['claude']['accounts']
    codexAccounts?: AccountsSnapshot['codex']['accounts']
    inactiveClaudeAccounts?: InactiveAccountUsage[]
    inactiveCodexAccounts?: InactiveAccountUsage[]
  } = {}
): AccountsSnapshot {
  return {
    claude: {
      accounts: overrides.claudeAccounts ?? [],
      activeAccountId: null,
      activeAccountIdsByRuntime: { host: null, wsl: {} }
    },
    codex: {
      accounts: overrides.codexAccounts ?? [],
      activeAccountId: null,
      activeAccountIdsByRuntime: { host: null, wsl: {} }
    },
    rateLimits: {
      claude: overrides.claudeLimits ?? null,
      codex: overrides.codexLimits ?? null,
      claudeTarget: { runtime: 'host', wslDistro: null },
      codexTarget: { runtime: 'host', wslDistro: null },
      inactiveClaudeAccounts: overrides.inactiveClaudeAccounts ?? [],
      inactiveCodexAccounts: overrides.inactiveCodexAccounts ?? []
    }
  }
}

describe('hasActiveProviderUsage', () => {
  it('is false when there are no rate limits at all', () => {
    expect(hasActiveProviderUsage(null)).toBe(false)
  })

  it('is true when a session window has data', () => {
    expect(
      hasActiveProviderUsage(
        makeLimits({
          status: 'ok',
          session: { usedPercent: 12, windowMinutes: 300, resetsAt: null, resetDescription: null }
        })
      )
    ).toBe(true)
  })

  it('is true when a successful fetch returned ok even with empty windows', () => {
    expect(hasActiveProviderUsage(makeLimits({ status: 'ok' }))).toBe(true)
  })

  it('is false for an unavailable/error provider with no window data (no creds)', () => {
    expect(hasActiveProviderUsage(makeLimits({ status: 'unavailable' }))).toBe(false)
    expect(hasActiveProviderUsage(makeLimits({ status: 'error', error: 'nope' }))).toBe(false)
  })
})

describe('hasRenderableUsage', () => {
  it('is true when the provider has at least one managed account', () => {
    const snapshot = makeSnapshot({
      claudeAccounts: [{ id: 'a', email: 'x@y.z' }]
    })
    expect(hasRenderableUsage(snapshot, 'claude')).toBe(true)
  })

  // System-default auth has no managed accounts but real usage; home must not hide it.
  it('is true with zero managed accounts when active rate-limit data exists (system default)', () => {
    const snapshot = makeSnapshot({
      codexLimits: makeLimits({
        provider: 'codex',
        status: 'ok',
        session: { usedPercent: 40, windowMinutes: 300, resetsAt: null, resetDescription: null }
      })
    })
    expect(hasRenderableUsage(snapshot, 'codex')).toBe(true)
  })

  it('is false with zero accounts and no usable rate-limit data', () => {
    const snapshot = makeSnapshot({
      claudeLimits: makeLimits({ status: 'unavailable' })
    })
    expect(hasRenderableUsage(snapshot, 'claude')).toBe(false)
    expect(hasRenderableUsage(makeSnapshot(), 'claude')).toBe(false)
  })
})

describe('getInactiveProviderUsage', () => {
  it('returns inactive usage using the runtime rateLimits payload shape', () => {
    const limits = makeLimits({
      status: 'ok',
      session: { usedPercent: 52, windowMinutes: 300, resetsAt: null, resetDescription: null }
    })
    const snapshot = makeSnapshot({
      inactiveClaudeAccounts: [
        { accountId: 'account-1', rateLimits: limits, updatedAt: 123, isFetching: false }
      ]
    })

    expect(getInactiveProviderUsage(snapshot, 'claude', 'account-1')?.rateLimits).toBe(limits)
  })
})

function interpolate(template: string, options?: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(options?.[name] ?? ''))
}

const en: Translate = (_key, fallback, options) => interpolate(fallback, options)

// Real Korean catalog: unit words must not fall back to the English d/h/m abbreviations.
const ko: Translate = (key, fallback, options) => {
  const screen: Record<string, string> = koCatalog.accounts.screen
  const name = key.replace('accounts.screen.', '')
  return interpolate(screen[name] ?? fallback, options)
}

describe('getWindowResetLabel', () => {
  const now = 1_700_000_000_000
  const min = 60_000
  const hour = 60 * min
  const day = 24 * hour

  function makeWindow(resetsAt: number | null): ProviderRateLimits['session'] {
    return { usedPercent: 13, windowMinutes: 300, resetsAt, resetDescription: null }
  }

  it('is null when there are no limits or the window has no reset timestamp', () => {
    expect(getWindowResetLabel(null, 'session', now, en)).toBe(null)
    expect(getWindowResetLabel(makeLimits({ status: 'ok' }), 'session', now, en)).toBe(null)
    expect(
      getWindowResetLabel(
        makeLimits({ status: 'ok', session: makeWindow(null) }),
        'session',
        now,
        en
      )
    ).toBe(null)
  })

  it('formats minutes, hours+minutes, and days+hours like the desktop tooltip', () => {
    expect(
      getWindowResetLabel(makeLimits({ session: makeWindow(now + 47 * min) }), 'session', now, en)
    ).toBe('Resets in 47m')
    expect(
      getWindowResetLabel(
        makeLimits({ session: makeWindow(now + 3 * hour + 54 * min) }),
        'session',
        now,
        en
      )
    ).toBe('Resets in 3h 54m')
    expect(
      getWindowResetLabel(
        makeLimits({ weekly: makeWindow(now + 6 * day + 7 * hour) }),
        'weekly',
        now,
        en
      )
    ).toBe('Resets in 6d 7h')
  })

  it('formats exact hours and exact days without a zero remainder', () => {
    expect(
      getWindowResetLabel(makeLimits({ session: makeWindow(now + 2 * hour) }), 'session', now, en)
    ).toBe('Resets in 2h')
    expect(
      getWindowResetLabel(makeLimits({ weekly: makeWindow(now + 7 * day) }), 'weekly', now, en)
    ).toBe('Resets in 7d')
  })

  it('reports "Resets now" for a reset timestamp in the past', () => {
    expect(
      getWindowResetLabel(makeLimits({ session: makeWindow(now - min) }), 'session', now, en)
    ).toBe('Resets now')
  })

  it('uses Korean unit words on a Korean screen', () => {
    expect(
      getWindowResetLabel(
        makeLimits({ weekly: makeWindow(now + 3 * day + 19 * hour) }),
        'weekly',
        now,
        ko
      )
    ).toBe('3일 19시간 후 초기화')
    expect(
      getWindowResetLabel(
        makeLimits({ session: makeWindow(now + 3 * hour + 54 * min) }),
        'session',
        now,
        ko
      )
    ).toBe('3시간 54분 후 초기화')
    expect(
      getWindowResetLabel(makeLimits({ session: makeWindow(now - min) }), 'session', now, ko)
    ).toBe('곧 초기화')
  })

  it('reads the requested window only', () => {
    const limits = makeLimits({ session: makeWindow(now + hour) })
    expect(getWindowResetLabel(limits, 'weekly', now, en)).toBe(null)
  })
})

describe('getUsageBarState', () => {
  it('keeps stale window data visible during a transient error', () => {
    const bar = getUsageBarState(
      makeLimits({
        status: 'error',
        error: 'temporarily unavailable',
        session: { usedPercent: 72, windowMinutes: 300, resetsAt: null, resetDescription: null }
      }),
      'session'
    )

    expect(bar).toEqual({ usedPercent: 72, unavailable: false, loading: false, hidden: false })
  })

  it('shows loading for a fetching provider without a window', () => {
    expect(getUsageBarState(makeLimits({ status: 'fetching' }), 'weekly')).toEqual({
      usedPercent: null,
      unavailable: false,
      loading: true,
      hidden: false
    })
  })
})

describe('showsSessionWindow', () => {
  const weekly = { usedPercent: 40, windowMinutes: 10080, resetsAt: null, resetDescription: null }

  it('drops the 5h row for a plan that reports only the weekly window', () => {
    expect(showsSessionWindow(makeLimits({ status: 'ok', weekly }))).toBe(false)
  })

  it('keeps the 5h row while no window has arrived, so errors and loading still show', () => {
    expect(showsSessionWindow(makeLimits({ status: 'fetching' }))).toBe(true)
    expect(showsSessionWindow(makeLimits({ status: 'error', error: 'offline' }))).toBe(true)
    expect(showsSessionWindow(null)).toBe(true)
  })
  it('hides only the 5h bar of a weekly-only plan', () => {
    const limits = makeLimits({ status: 'ok', weekly })
    expect(getUsageBarState(limits, 'session').hidden).toBe(true)
    expect(getUsageBarState(limits, 'weekly').hidden).toBe(false)
  })
})
