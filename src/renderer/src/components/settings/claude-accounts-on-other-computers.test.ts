import { describe, expect, it } from 'vitest'
import type { ClaudeRateLimitAccountsState } from '../../../../shared/managed-account-types'
import { findClaudeAccountsMissingHere } from './claude-accounts-on-other-computers'

function roster(emails: string[], extra: Partial<ClaudeRateLimitAccountsState> = {}) {
  return {
    accounts: emails.map((email, index) => ({
      id: `id-${index}`,
      email,
      managedAuthRuntime: 'host',
      authMethod: 'subscription-oauth',
      createdAt: 1,
      updatedAt: 1,
      lastAuthenticatedAt: 1
    })),
    activeAccountId: null,
    activeAccountIdsByRuntime: { host: null, wsl: {} },
    ...extra
  } as unknown as ClaudeRateLimitAccountsState
}

describe('findClaudeAccountsMissingHere', () => {
  it('lists logins other computers have that this one lacks, with where they are', () => {
    const here = roster(['sup@example.com'])
    const missing = findClaudeAccountsMissingHere(here, [
      { name: 'Mac mini', state: roster(['SUP@example.com', 'dev@example.com']) },
      {
        name: 'Mac Studio',
        state: roster(['dev@example.com'], { systemDefaultEmail: 'adm@example.com' })
      }
    ])

    expect(missing).toEqual([
      { email: 'adm@example.com', computers: ['Mac Studio'] },
      { email: 'dev@example.com', computers: ['Mac mini', 'Mac Studio'] }
    ])
  })

  it('counts this computer’s System default login as present', () => {
    const here = roster([], { systemDefaultEmail: 'dev@example.com' })
    expect(
      findClaudeAccountsMissingHere(here, [
        { name: 'Mac mini', state: roster(['dev@example.com']) }
      ])
    ).toEqual([])
  })
})
