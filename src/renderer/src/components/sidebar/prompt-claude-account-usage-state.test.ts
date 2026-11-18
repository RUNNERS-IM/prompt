import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderRateLimits } from '../../../../shared/rate-limit-types'
import {
  describeAccountUsage,
  formatLastReadAt,
  readRememberedAccountUsage,
  rememberAccountUsage
} from './prompt-claude-account-usage-state'

const NOW = new Date(2026, 10, 19, 9, 0).getTime()
const week = {
  usedPercent: 34,
  windowMinutes: 10080,
  resetsAt: NOW + 86_400_000,
  resetDescription: null
}

function limits(over: Partial<ProviderRateLimits>): ProviderRateLimits {
  return {
    provider: 'claude',
    session: null,
    weekly: null,
    updatedAt: NOW,
    error: null,
    status: 'ok',
    ...over
  }
}

describe('describeAccountUsage', () => {
  it('shows nothing-read-yet when no usage arrived', () => {
    expect(describeAccountUsage(null, null, NOW)).toEqual({ kind: 'empty' })
  })

  it('keeps the reason for an expired idle login instead of dropping it', () => {
    const view = describeAccountUsage(
      limits({
        status: 'error',
        usageMetadata: { failureKind: 'stale-token' }
      }),
      null,
      NOW
    )
    expect(view).toMatchObject({
      kind: 'failed',
      reason: 'stale-token',
      lastReadAt: null
    })
  })

  it('falls back to the numbers remembered on this device, dropping windows already reset', () => {
    const readAt = NOW - 6 * 86_400_000
    const view = describeAccountUsage(
      limits({ status: 'error', usageMetadata: { failureKind: 'network' } }),
      { session: { ...week, resetsAt: NOW - 1 }, weekly: week, readAt },
      NOW
    )
    expect(view).toMatchObject({
      kind: 'failed',
      reason: 'other',
      session: null,
      weekly: week,
      lastReadAt: readAt
    })
  })
})

describe('remembered usage', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v)
    })
  })

  it('stores only successful reads', () => {
    rememberAccountUsage('admin', limits({ status: 'error', weekly: week }))
    expect(readRememberedAccountUsage('admin')).toBeNull()
    rememberAccountUsage('admin', limits({ weekly: week }))
    expect(readRememberedAccountUsage('admin')).toEqual({
      session: null,
      weekly: week,
      readAt: NOW
    })
  })

  it('formats the last read time as MM-DD HH:mm', () => {
    expect(formatLastReadAt(new Date(2026, 10, 13, 7, 14).getTime())).toBe('11-13 07:14')
  })
})
