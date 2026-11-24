import React, { useEffect } from 'react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useResetCountdownClock } from '@/hooks/useResetCountdownClock'
import { formatLocalizedResetCountdown } from '@/lib/reset-duration-label'
import type { ProviderRateLimits, RateLimitWindow } from '../../../../shared/rate-limit-types'
import {
  getDisplayedUsagePercentage,
  normalizeUsagePercentageDisplay
} from '../../../../shared/usage-percentage-display'
import { formatBareUsagePercentage } from '../status-bar/usage-percentage-label'
import { barColor, clampUsedPercent } from '../status-bar/tooltip'
import { getProviderUsageErrorMessage } from '../status-bar/usage-error-copy'
import {
  describeAccountUsage,
  formatLastReadAt,
  readRememberedAccountUsage,
  rememberAccountUsage
} from './prompt-claude-account-usage-state'

function UsageLine({
  label,
  window,
  now
}: {
  label: string
  window: RateLimitWindow | null
  now: number
}): React.JSX.Element | null {
  const display = normalizeUsagePercentageDisplay(useAppStore((s) => s.usagePercentageDisplay))
  if (!window) {
    return null
  }
  const used = clampUsedPercent(window.usedPercent)
  const reset =
    window.resetsAt && window.resetsAt > now
      ? formatLocalizedResetCountdown(window.resetsAt - now)
      : null
  // 다시 차는 때는 따로 한 줄에 둔다. 한 줄에 몰면 독일어 · 아랍어 등 17개 언어에서 잘렸다(사용자 답: 권장안대로, 11-25).
  return (
    <>
      <span className="truncate">{label}</span>
      <div className="h-[4px] overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', barColor(used))}
          style={{ width: `${getDisplayedUsagePercentage(used, display)}%` }}
        />
      </div>
      <span className="tabular-nums text-foreground/80">
        {formatBareUsagePercentage(used, display)}
      </span>
      {reset ? <span className="col-span-3 col-start-2 min-w-0 truncate">{reset}</span> : null}
    </>
  )
}

function UsageLines({
  session,
  weekly,
  now
}: {
  session: RateLimitWindow | null
  weekly: RateLimitWindow | null
  now: number
}): React.JSX.Element {
  // 이름 칸은 가장 긴 이름에 맞춰 두 줄의 막대가 같은 자리에서 시작한다.
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,max-content)_3.5rem_2.25rem_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 text-[11px] leading-4 text-muted-foreground">
      <UsageLine
        label={translate('auto.components.status.bar.tooltip.94038ad2fa', 'Session')}
        window={session}
        now={now}
      />
      <UsageLine
        label={translate('auto.components.status.bar.tooltip.252c096536', 'Weekly')}
        window={weekly}
        now={now}
      />
    </div>
  )
}

/** 계정 메뉴 한 줄의 사용량. 읽기에 실패한 계정은 이유 · 할 일을 먼저 보이고, 마지막으로 읽은 숫자는 흐리게 둔다. */
export function AccountUsage({
  accountId,
  limits
}: {
  accountId: string
  limits: ProviderRateLimits | null
}): React.JSX.Element {
  useEffect(() => rememberAccountUsage(accountId, limits), [accountId, limits])
  const now = useResetCountdownClock([limits?.session?.resetsAt, limits?.weekly?.resetsAt])
  const view = describeAccountUsage(limits, readRememberedAccountUsage(accountId), now)
  if (view.kind === 'empty') {
    return (
      <span className="text-[11px] leading-4 text-muted-foreground">
        {translate('prompt.claudeAccount.noUsage', 'Usage not read yet')}
      </span>
    )
  }
  if (view.kind === 'live') {
    return <UsageLines session={view.session} weekly={view.weekly} now={now} />
  }
  return (
    <>
      <span className="text-[11px] leading-4 text-status-warning-text">
        {view.reason === 'stale-token'
          ? translate(
              'prompt.claudeAccount.staleUsage',
              'Sign-in is old, so usage could not be read'
            )
          : limits && getProviderUsageErrorMessage(limits)}
      </span>
      {view.reason === 'stale-token' ? (
        <span className="text-[11px] leading-4 text-muted-foreground">
          {translate(
            'prompt.claudeAccount.staleUsageHint',
            'Switch to this account and run Claude once to see it again'
          )}
        </span>
      ) : null}
      {view.session || view.weekly ? (
        <div className="flex flex-col gap-1 opacity-50">
          <UsageLines session={view.session} weekly={view.weekly} now={now} />
        </div>
      ) : null}
      {view.lastReadAt ? (
        <span className="text-[11px] leading-4 text-muted-foreground">
          {translate('prompt.claudeAccount.lastRead', 'Last read {{time}}', {
            time: formatLastReadAt(view.lastReadAt)
          })}
        </span>
      ) : null}
    </>
  )
}
