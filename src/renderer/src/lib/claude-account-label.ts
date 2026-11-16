import { translate } from '@/i18n/i18n'
import type { ClaudeRateLimitAccountsState } from '../../../shared/managed-account-types'

/** Display label for a selected Claude account row; null is System default. */
export function getClaudeAccountLabel(
  state: Pick<ClaudeRateLimitAccountsState, 'accounts'>,
  accountId: string | null | undefined
): string {
  if (accountId == null) {
    return translate('accounts.claude.systemDefault', 'System default')
  }
  return (
    state.accounts.find((account) => account.id === accountId)?.email ??
    translate('accounts.claude.unnamedAccount', 'Claude account')
  )
}

/** A saved account signed in as the active System default: the same login, so one row names it. */
export function isActiveSystemDefaultTwin(
  account: ClaudeRateLimitAccountsState['accounts'][number],
  state: Pick<ClaudeRateLimitAccountsState, 'systemDefaultEmail'>,
  activeAccountId: string | null
): boolean {
  const email = state.systemDefaultEmail?.toLowerCase()
  return (
    activeAccountId === null &&
    account.managedAuthRuntime !== 'wsl' &&
    !!email &&
    account.email.toLowerCase() === email
  )
}
