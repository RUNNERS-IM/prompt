import type { HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import type { ClaudeRateLimitAccountsState } from '../../shared/managed-account-types'
import { formatAccountsBlock } from './account-list-format'

/** Match `--account` by id or email; `system` is System default. */
export function resolveClaudeAccountSelector(
  state: Pick<ClaudeRateLimitAccountsState, 'accounts'>,
  selector: string
): string | null {
  if (selector === 'system') {
    return null
  }
  const wanted = selector.trim().toLowerCase()
  const byId = state.accounts.find((account) => account.id === selector)
  if (byId) {
    return byId.id
  }
  const byEmail = state.accounts.filter((account) => account.email.trim().toLowerCase() === wanted)
  if (byEmail.length === 1) {
    return byEmail[0].id
  }
  const known = state.accounts.map((account) => `${account.id} (${account.email})`).join(', ')
  throw new RuntimeClientError(
    'invalid_argument',
    byEmail.length > 1
      ? `More than one Claude account uses ${selector}; pass its id: ${known}.`
      : `No managed Claude account matches ${selector}. Known: ${known || 'none'}. Add one with \`prompt account add\`.`
  )
}

export async function selectClaudeAccount(ctx: HandlerContext): Promise<void> {
  const selector = ctx.flags.get('account')
  if (typeof selector !== 'string' || !selector) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Use --agent claude and --account <id|email|system>.'
    )
  }
  const snapshot = await ctx.client.call<{ claude: ClaudeRateLimitAccountsState }>(
    'accounts.list',
    {
      refreshUsage: false
    }
  )
  const result = await ctx.client.call<ClaudeRateLimitAccountsState>('accounts.selectClaude', {
    accountId: resolveClaudeAccountSelector(snapshot.result.claude, selector),
    followRunningSessions: true
  })
  printResult(result, ctx.json, (state) => formatAccountsBlock('Claude', state))
}
