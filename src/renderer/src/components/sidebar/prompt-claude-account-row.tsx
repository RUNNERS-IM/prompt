import React, { useCallback, useEffect, useState } from 'react'
import { Check, ChevronDown, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useModalReturnFocus } from '@/hooks/useModalReturnFocus'
import { getClaudeAccountLabel, isActiveSystemDefaultTwin } from '@/lib/claude-account-label'
import { handleRunningClaudeSessionsAfterSwitch } from '@/lib/claude-account-switch-sessions'
import { signInToClaudeAccount } from '@/lib/claude-account-sign-in'
import type { ClaudeRateLimitAccountsState } from '../../../../shared/managed-account-types'
import type { ProviderRateLimits } from '../../../../shared/rate-limit-types'
import { normalizeUsagePercentageDisplay } from '../../../../shared/usage-percentage-display'
import { getProviderAccountActiveIdForView } from '../settings/provider-account-visibility'
import { getClaudeAccountErrorDescription } from '../settings/accounts-pane-action-errors'
import { getClaudeAccountSyncKey } from '../status-bar/provider-account-sync-key'
import { formatBareUsagePercentage } from '../status-bar/usage-percentage-label'
import { ClaudeIcon } from '../status-bar/icons'
import { clampUsedPercent } from '../status-bar/tooltip'
import { AccountUsage } from './prompt-claude-account-usage'

const HOST_VIEW = { runtime: 'host' } as const
const EMPTY: ClaudeRateLimitAccountsState = {
  accounts: [],
  activeAccountId: null,
  activeAccountIdsByRuntime: { host: null, wsl: {} }
}

/**
 * Prompt: this Mac's Claude account right under the computer name. The menu lists each account's
 * 5-hour and weekly usage, switches by hand, and turns automatic picking on or off.
 */
export function PromptClaudeAccountRow(): React.JSX.Element | null {
  const [accounts, setAccounts] = useState<ClaudeRateLimitAccountsState>(EMPTY)
  const [switching, setSwitching] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // Why: Radix hands focus back to the trigger on close, so the next Enter or Space reopened the menu.
  const { skipReturnFocus } = useModalReturnFocus(menuOpen)
  const syncKey = useAppStore((s) => getClaudeAccountSyncKey(s.settings))
  const autoPick = useAppStore((s) => s.settings?.claudeAccountAutoPick === true)
  const activeUsage = useAppStore((s) =>
    s.rateLimits.claudeTarget.runtime === 'host' ? s.rateLimits.claude : null
  )
  const inactiveUsage = useAppStore((s) => s.rateLimits.inactiveClaudeAccounts)
  const display = normalizeUsagePercentageDisplay(useAppStore((s) => s.usagePercentageDisplay))
  const api = window.api?.claudeAccounts

  const load = useCallback(() => {
    if (!api) {
      return
    }
    void api
      .list()
      .then(setAccounts)
      .catch((error: unknown) => console.error('Failed to load Claude accounts:', error))
  }, [api])

  useEffect(load, [load, syncKey])

  if (!api) {
    return null
  }
  const activeId = getProviderAccountActiveIdForView(accounts, HOST_VIEW)
  const hostAccounts = accounts.accounts.filter(
    (account) =>
      account.managedAuthRuntime !== 'wsl' &&
      !isActiveSystemDefaultTwin(account, accounts, activeId)
  )
  const activeLabel = getClaudeAccountLabel(accounts, activeId)
  const activeWeekly = activeUsage?.weekly ? clampUsedPercent(activeUsage.weekly.usedPercent) : null

  const usageFor = (accountId: string): ProviderRateLimits | null =>
    accountId === activeId
      ? activeUsage
      : (inactiveUsage.find((entry) => entry.accountId === accountId)?.rateLimits ?? null)

  const choose = async (accountId: string): Promise<void> => {
    const store = useAppStore.getState()
    setSwitching(true)
    try {
      // Picking by hand means this account on purpose; automatic picking would move it right back.
      if (autoPick) {
        await store.updateSettings({ claudeAccountAutoPick: false })
      }
      const next = await api.select({ accountId, runtime: 'host', wslDistro: null })
      setAccounts(next)
      await store.fetchSettings()
      void handleRunningClaudeSessionsAfterSwitch({
        owner: { kind: 'local' },
        target: HOST_VIEW,
        before: { state: accounts, accountId: activeId },
        after: { state: next, accountId: getProviderAccountActiveIdForView(next, HOST_VIEW) }
      })
    } catch (error) {
      toast.error(
        translate(
          'auto.components.settings.AccountsPane.2743cdc0af',
          'Claude account update failed.'
        ),
        { description: getClaudeAccountErrorDescription(error) }
      )
    } finally {
      setSwitching(false)
    }
  }

  const openManage = (): void => {
    // Settings takes focus itself; handing it back to the terminal would pull it away again.
    skipReturnFocus()
    const store = useAppStore.getState()
    store.openSettingsTarget({ pane: 'prompt-account', repoId: null, sectionId: 'accounts-claude' })
    store.openSettingsPage()
  }

  return (
    <DropdownMenu
      open={menuOpen}
      onOpenChange={(open) => {
        setMenuOpen(open)
        if (open) {
          load()
          void useAppStore.getState().fetchInactiveClaudeAccountUsage()
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] text-worktree-sidebar-foreground/70 transition-colors hover:bg-worktree-sidebar-foreground/8 data-[state=open]:bg-worktree-sidebar-foreground/8"
          aria-label={translate('prompt.claudeAccount.title', 'Claude account')}
          data-prompt-claude-account-trigger=""
        >
          <ClaudeIcon size={14} />
          <span className="min-w-0 flex-1 truncate">{activeLabel}</span>
          {autoPick ? (
            <Sparkles
              className="size-3 shrink-0 text-worktree-sidebar-foreground/45"
              strokeWidth={1.5}
              aria-label={translate('prompt.claudeAccount.autoPick', 'Pick automatically')}
            />
          ) : null}
          {activeWeekly !== null ? (
            <span className="shrink-0 tabular-nums text-[11px] text-worktree-sidebar-foreground/50">
              {translate('prompt.claudeAccount.weeklyShort', 'Weekly {{percent}}', {
                percent: formatBareUsagePercentage(activeWeekly, display)
              })}
            </span>
          ) : null}
          <ChevronDown
            className="size-3.5 shrink-0 text-worktree-sidebar-foreground/40"
            strokeWidth={1.5}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={4}
        className="w-80"
        data-prompt-claude-account-menu=""
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuLabel>
          {translate('prompt.claudeAccount.title', 'Claude account')}
        </DropdownMenuLabel>
        <div className="max-h-96 overflow-y-auto scrollbar-sleek">
          {hostAccounts.map((account) => {
            const active = account.id === activeId
            return (
              <DropdownMenuItem
                key={account.id}
                disabled={switching || (active && !account.needsSignIn)}
                className={cn(
                  'items-start data-[disabled]:opacity-100',
                  active && 'bg-black/6 dark:bg-white/10'
                )}
                data-prompt-claude-account-row={account.id}
                onSelect={(event) => {
                  event.preventDefault()
                  if (account.needsSignIn) {
                    void signInToClaudeAccount(account.id).then((ok) => ok && load())
                  } else if (!active) {
                    void choose(account.id)
                  }
                }}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px]">{account.email}</span>
                    {active ? (
                      <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
                        {translate('auto.components.status.bar.StatusBar.ff0fbe9311', 'Active')}
                      </span>
                    ) : null}
                  </div>
                  {account.needsSignIn ? (
                    <span className="text-[11px] leading-4 text-muted-foreground">
                      {translate('prompt.claudeAccount.signInAgain', 'Sign in again to use it')}
                    </span>
                  ) : (
                    <AccountUsage accountId={account.id} limits={usageFor(account.id)} />
                  )}
                </div>
                {active ? (
                  <Check className="mt-0.5 size-3.5 text-foreground" strokeWidth={1.5} />
                ) : (
                  <span aria-hidden className="size-3.5" />
                )}
              </DropdownMenuItem>
            )
          })}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="items-start"
          data-prompt-claude-account-action="auto-pick"
          onSelect={(event) => {
            event.preventDefault()
            void useAppStore.getState().updateSettings({ claudeAccountAutoPick: !autoPick })
          }}
        >
          <Sparkles className="mt-0.5" strokeWidth={1.5} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">
              {translate('prompt.claudeAccount.autoPick', 'Pick automatically')}
            </span>
            <span className="text-[11px] leading-4 text-muted-foreground">
              {translate(
                'prompt.claudeAccount.autoPickHint',
                'Uses the account whose weekly limit resets soonest'
              )}
            </span>
          </div>
          {autoPick ? (
            <Check className="mt-0.5 size-3.5 text-foreground" strokeWidth={1.5} />
          ) : (
            <span aria-hidden className="size-3.5" />
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={openManage} data-prompt-claude-account-action="manage">
          {translate('prompt.claudeAccount.manage', 'Add or manage accounts…')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
