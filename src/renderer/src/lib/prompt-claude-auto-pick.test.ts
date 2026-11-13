import { describe, expect, it, vi } from 'vitest'
import type { ClaudeRateLimitAccountsState } from '../../../shared/managed-account-types'
import type { ProviderRateLimits } from '../../../shared/rate-limit-types'

vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))
vi.mock('sonner', () => ({ toast: { info: vi.fn() } }))

const { runClaudeAutoPick } = await import('./prompt-claude-auto-pick')

const NOW = 1_000_000
const HOUR = 3_600_000

const account = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  email: `${id}@example.com`,
  managedAuthRuntime: 'host' as const,
  wslDistro: null,
  authMethod: 'subscription-oauth' as const,
  createdAt: 1,
  updatedAt: 1,
  lastAuthenticatedAt: 1,
  ...extra
})

function roster(activeId: string, ...accounts: ReturnType<typeof account>[]) {
  return {
    accounts,
    activeAccountId: activeId,
    activeAccountIdsByRuntime: { host: activeId, wsl: {} }
  } as ClaudeRateLimitAccountsState
}

function limits(weekly: number, weeklyResetIn: number): ProviderRateLimits {
  return {
    provider: 'claude',
    session: { usedPercent: 10, windowMinutes: 300, resetsAt: NOW + HOUR, resetDescription: null },
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

describe('runClaudeAutoPick', () => {
  it('switches to the account whose weekly limit resets soonest and reports it', async () => {
    const before = roster('a', account('a'), account('b'))
    const after = roster('b', account('a'), account('b'))
    const select = vi.fn(async () => after)
    const onSwitched = vi.fn()

    const picked = await runClaudeAutoPick({
      listAccounts: async () => before,
      select,
      readUsage: () => ({
        active: limits(30, 6 * 24 * HOUR),
        inactive: [
          { accountId: 'b', rateLimits: limits(70, 3 * HOUR), updatedAt: NOW, isFetching: false }
        ]
      }),
      onSwitched,
      now: () => NOW
    })

    expect(picked).toBe('b')
    expect(select).toHaveBeenCalledWith('b')
    expect(onSwitched).toHaveBeenCalledWith(before, after)
  })

  it('does not switch to an account that needs a sign-in', async () => {
    const select = vi.fn()
    const picked = await runClaudeAutoPick({
      listAccounts: async () => roster('a', account('a'), account('b', { needsSignIn: true })),
      select,
      readUsage: () => ({
        active: limits(30, 6 * 24 * HOUR),
        inactive: [
          { accountId: 'b', rateLimits: limits(70, 3 * HOUR), updatedAt: NOW, isFetching: false }
        ]
      }),
      onSwitched: vi.fn(),
      now: () => NOW
    })

    expect(picked).toBeNull()
    expect(select).not.toHaveBeenCalled()
  })
})
