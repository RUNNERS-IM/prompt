import { describe, expect, it } from 'vitest'
import type { ClaudeManagedAccountSummary } from '../../shared/managed-account-types'
import { resolveClaudeAccountSelector } from './account-claude-select'

function account(id: string, email: string): ClaudeManagedAccountSummary {
  return {
    id,
    email,
    authMethod: 'subscription-oauth',
    createdAt: 0,
    updatedAt: 0,
    lastAuthenticatedAt: 0
  }
}

describe('resolveClaudeAccountSelector', () => {
  const state = {
    accounts: [account('a1', 'dev@example.com'), account('a2', 'Admin@Example.com')]
  }

  it('maps system to System default', () => {
    expect(resolveClaudeAccountSelector(state, 'system')).toBeNull()
  })

  it('matches an id, then an email without case', () => {
    expect(resolveClaudeAccountSelector(state, 'a1')).toBe('a1')
    expect(resolveClaudeAccountSelector(state, 'admin@example.com')).toBe('a2')
  })

  it('names the known accounts when nothing matches', () => {
    expect(() => resolveClaudeAccountSelector(state, 'nobody@example.com')).toThrow(
      /a1 \(dev@example.com\)/
    )
  })

  it('asks for an id when one email has two accounts', () => {
    const shared = { accounts: [account('p', 'x@example.com'), account('t', 'x@example.com')] }
    expect(() => resolveClaudeAccountSelector(shared, 'x@example.com')).toThrow(/pass its id/)
  })
})
