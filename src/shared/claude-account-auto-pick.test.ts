import { describe, expect, it } from 'vitest'
import type { ProviderRateLimits } from './rate-limit-types'
import {
  claudeLimitsFreeAt,
  claudeLimitsNextResetAt,
  pickClaudeAccountBySoonestReset
} from './claude-account-auto-pick'

const NOW = 1_000_000
const HOUR = 3_600_000

function limits(session: number, weekly: number, weeklyResetIn: number): ProviderRateLimits {
  return {
    provider: 'claude',
    session: {
      usedPercent: session,
      windowMinutes: 300,
      resetsAt: NOW + HOUR,
      resetDescription: null
    },
    weekly: {
      usedPercent: weekly,
      windowMinutes: 10080,
      resetsAt: NOW + weeklyResetIn,
      resetDescription: null
    },
    updatedAt: NOW,
    error: null,
    status: 'ok'
  }
}

describe('pickClaudeAccountBySoonestReset', () => {
  it('uses the account whose weekly window resets soonest', () => {
    const picked = pickClaudeAccountBySoonestReset(
      [
        { accountId: 'a', limits: limits(10, 40, 5 * 24 * HOUR) },
        { accountId: 'b', limits: limits(10, 80, 2 * HOUR) }
      ],
      'a',
      NOW
    )
    expect(picked).toBe('b')
  })

  it('skips an account whose 5-hour window is full until it frees up', () => {
    const candidates = [
      { accountId: 'a', limits: limits(30, 40, 5 * 24 * HOUR) },
      { accountId: 'b', limits: limits(100, 80, 2 * HOUR) }
    ]
    expect(pickClaudeAccountBySoonestReset(candidates, 'b', NOW)).toBe('a')
    // The 5-hour window resets after one hour; then b is soonest again.
    expect(pickClaudeAccountBySoonestReset(candidates, 'a', NOW + HOUR)).toBe('b')
  })

  it('skips an account whose weekly window is full', () => {
    const picked = pickClaudeAccountBySoonestReset(
      [
        { accountId: 'a', limits: limits(10, 40, 5 * 24 * HOUR) },
        { accountId: 'b', limits: limits(10, 100, 2 * HOUR) }
      ],
      'b',
      NOW
    )
    expect(picked).toBe('a')
  })

  it('skips accounts with no usage reading', () => {
    const picked = pickClaudeAccountBySoonestReset(
      [
        { accountId: 'a', limits: limits(10, 40, 5 * 24 * HOUR) },
        { accountId: 'b', limits: null }
      ],
      'a',
      NOW
    )
    expect(picked).toBe('a')
  })

  it('stays on the current account when none has room', () => {
    const picked = pickClaudeAccountBySoonestReset(
      [
        { accountId: 'a', limits: limits(100, 40, 5 * 24 * HOUR) },
        { accountId: 'b', limits: limits(10, 100, 2 * HOUR) }
      ],
      'a',
      NOW
    )
    expect(picked).toBe('a')
  })

  it('keeps the current account on a tie', () => {
    const picked = pickClaudeAccountBySoonestReset(
      [
        { accountId: 'a', limits: limits(10, 40, 2 * HOUR) },
        { accountId: 'b', limits: limits(10, 40, 2 * HOUR) }
      ],
      'b',
      NOW
    )
    expect(picked).toBe('b')
  })
})

describe('claudeLimitsFreeAt', () => {
  const window = (usedPercent: number, resetsAt: number | null) => ({
    usedPercent,
    windowMinutes: 300,
    resetsAt,
    resetDescription: null
  })
  const limits = (session: ReturnType<typeof window>, weekly: ReturnType<typeof window>) =>
    ({ provider: 'claude', session, weekly, updatedAt: 0, error: null, status: 'ok' }) as const

  it('waits for every full window', () => {
    expect(claudeLimitsFreeAt(limits(window(100, 500), window(100, 900)), 0)).toBe(900)
    expect(claudeLimitsFreeAt(limits(window(40, 500), window(100, 900)), 0)).toBe(900)
  })

  it('is null when nothing is full or a full window has no reset', () => {
    expect(claudeLimitsFreeAt(limits(window(40, 500), window(60, 900)), 0)).toBeNull()
    expect(claudeLimitsFreeAt(limits(window(100, null), window(60, 900)), 0)).toBeNull()
  })

  it('takes the nearer reset for a limit not yet shown in the reading', () => {
    expect(claudeLimitsNextResetAt(limits(window(97, 500), window(60, 900)), 0)).toBe(500)
    expect(claudeLimitsNextResetAt(limits(window(97, 500), window(60, 900)), 600)).toBe(900)
  })
})
