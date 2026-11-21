import { useEffect, useState } from 'react'
import { Monitor } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { ProviderAccountsSnapshot } from '@/runtime/runtime-provider-accounts-client'
import type { ClaudeRateLimitAccountsState } from '../../../../shared/managed-account-types'

// Why short: a computer that is asleep or off must not hold the notice back for long.
const READ_TIMEOUT_MS = 8_000

export type OtherComputerClaudeAccount = { email: string; computers: string[] }

/** The Claude logins one roster can switch to: saved host accounts that are signed in, and System default. */
export function claudeLoginEmails(state: ClaudeRateLimitAccountsState): string[] {
  const emails = state.accounts
    .filter((account) => account.managedAuthRuntime !== 'wsl' && !account.needsSignIn)
    .map((account) => account.email)
  if (state.systemDefaultEmail) {
    emails.push(state.systemDefaultEmail)
  }
  return [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))]
}

/** Logins other computers have that this one lacks, with the computers that have each. */
export function findClaudeAccountsMissingHere(
  here: ClaudeRateLimitAccountsState,
  others: readonly { name: string; state: ClaudeRateLimitAccountsState }[]
): OtherComputerClaudeAccount[] {
  const local = new Set(claudeLoginEmails(here))
  const byEmail = new Map<string, string[]>()
  for (const other of others) {
    for (const email of claudeLoginEmails(other.state)) {
      if (!local.has(email)) {
        byEmail.set(email, [...(byEmail.get(email) ?? []), other.name])
      }
    }
  }
  return [...byEmail.entries()]
    .map(([email, computers]) => ({ email, computers }))
    .sort((a, b) => a.email.localeCompare(b.email))
}

async function readOtherComputers(): Promise<
  { name: string; state: ClaudeRateLimitAccountsState }[]
> {
  const environments = await window.api.runtimeEnvironments.list()
  const read = await Promise.all(
    environments.map(async (environment) => {
      try {
        const snapshot = await callRuntimeRpc<ProviderAccountsSnapshot>(
          { kind: 'environment', environmentId: environment.id },
          'accounts.list',
          {},
          { timeoutMs: READ_TIMEOUT_MS, suppressFeatureInteraction: true }
        )
        // A roster that failed to load says nothing about which logins that computer has.
        if (snapshot.failedProviders?.includes('claude')) {
          return null
        }
        return { name: environment.name, state: snapshot.claude }
      } catch {
        return null
      }
    })
  )
  return read.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
}

/**
 * When this computer's every account is full, Prompt can only move sessions to logins saved here.
 * List the ones the user's other computers already use, so adding them here is one step away.
 */
export function ClaudeAccountsOnOtherComputers(props: {
  here: ClaudeRateLimitAccountsState
}): React.JSX.Element | null {
  const [others, setOthers] = useState<
    { name: string; state: ClaudeRateLimitAccountsState }[] | null
  >(null)
  useEffect(() => {
    if (!window.api?.runtimeEnvironments) {
      return
    }
    let active = true
    void readOtherComputers()
      .then((read) => {
        if (active) {
          setOthers(read)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  const missing = others ? findClaudeAccountsMissingHere(props.here, others) : []
  if (missing.length === 0) {
    return null
  }
  return (
    <div
      className="space-y-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2.5"
      data-prompt-claude-other-computers=""
    >
      <div className="space-y-0.5">
        <p className="flex items-center gap-1.5 text-[13px] font-medium leading-4">
          <Monitor className="size-3.5 text-muted-foreground" />
          {translate(
            'prompt.claudeAccount.otherComputersTitle',
            'Accounts on your other computers'
          )}
        </p>
        <p className="text-2xs leading-[14px] text-muted-foreground">
          {translate(
            'prompt.claudeAccount.otherComputersHint',
            'Not added here yet. Add them with Add Account so a session stopped at its limit can move to one.'
          )}
        </p>
      </div>
      <ul className="space-y-1">
        {missing.map((account) => (
          <li key={account.email} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate font-medium">{account.email}</span>
            <span className="shrink-0 text-2xs text-muted-foreground">
              {account.computers.join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
