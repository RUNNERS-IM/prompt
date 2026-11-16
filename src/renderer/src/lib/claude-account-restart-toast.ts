import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { INLINE_ACTION_CLASS_NAMES } from '@/components/ui/sonner'
import { getClaudeResumeFailures, subscribeClaudeResumeFailures } from './claude-resume-failure'

export type RestartingPane = { ptyId: string; tabId: string; leafId: string }

// 다시 시작은 한 장의 알림으로 묶는다(사용자 답 2A). 진행 중에 또 시작하면 같은 알림에 더한다.
const RESTART_TOAST_ID = 'claude-account-restart'
// 모두 다시 연 뒤 대화를 못 연 세션이 셸로 돌아오는지 지켜보는 시간.
const RESUME_WATCH_MS = 20_000
// 이 시간이 지나도 남은 세션은 하던 턴이 끝나거나 탭이 열릴 때 다시 시작된다고 알리고 알림을 닫는다.
const RESTART_SETTLE_MS = 2 * 60_000
const RESULT_MS = 5_000

type Extra = {
  description?: string
  classNames?: typeof INLINE_ACTION_CLASS_NAMES
  action?: { label: string; onClick: () => void }
}

type Batch = {
  panes: RestartingPane[]
  account: string
  extra: Extra
  startedAt: number
  deadline: number
  allRunAt: number | null
  stop: () => void
}

let batch: Batch | null = null

function notMovedExtra(others: number, review: (() => void) | undefined): Extra {
  if (others === 0 || !review) {
    return {}
  }
  return {
    description:
      others === 1
        ? translate('accounts.claude.switchSessions.notMovedOne', "1 other session wasn't moved.")
        : translate(
            'accounts.claude.switchSessions.notMovedOther',
            "{{count}} other sessions weren't moved.",
            { count: others }
          ),
    classNames: INLINE_ACTION_CLASS_NAMES,
    action: {
      label: translate('accounts.claude.switchSessions.review', 'Review'),
      onClick: review
    }
  }
}

function showProgress(current: Batch): void {
  const count = current.panes.length
  const account = current.account
  toast.loading(
    count === 1
      ? translate(
          'accounts.claude.switchSessions.restartingOne',
          'Restarting 1 Claude session on {{account}}',
          { account }
        )
      : translate(
          'accounts.claude.switchSessions.restartingOther',
          'Restarting {{count}} Claude sessions on {{account}}',
          { count, account }
        ),
    { id: RESTART_TOAST_ID, ...current.extra }
  )
}

function failedCount(current: Batch): number {
  return getClaudeResumeFailures().filter(
    (failure) =>
      failure.failedAt >= current.startedAt &&
      current.panes.some((pane) => pane.tabId === failure.tabId && pane.leafId === failure.leafId)
  ).length
}

function showResult(current: Batch, waiting: number): void {
  const count = current.panes.length
  const failed = failedCount(current)
  const done = count - waiting - failed
  const options = { id: RESTART_TOAST_ID, ...current.extra, duration: RESULT_MS }
  if (waiting > 0) {
    toast.info(
      translate(
        'accounts.claude.switchSessions.restartWaiting',
        'Restarted {{done}} of {{count}} Claude sessions on {{account}}. The rest restart when their turn ends or their tab is opened.',
        { done, count, account: current.account }
      ),
      options
    )
  } else if (failed > 0) {
    toast.warning(
      translate(
        'accounts.claude.switchSessions.restartedWithFailures',
        'Restarted {{done}} Claude sessions · {{failed}} failed',
        { done, failed }
      ),
      options
    )
  } else {
    toast.success(
      count === 1
        ? translate(
            'accounts.claude.switchSessions.restartedOne',
            'Restarted 1 Claude session on {{account}}',
            { account: current.account }
          )
        : translate(
            'accounts.claude.switchSessions.restartedOther',
            'Restarted {{count}} Claude sessions on {{account}}',
            { count, account: current.account }
          ),
      options
    )
  }
}

function settle(): void {
  const current = batch
  if (!current) {
    return
  }
  const pending = useAppStore.getState().pendingPaneAccountRestarts
  const waiting = current.panes.filter((pane) => pending[pane.ptyId]).length
  const now = Date.now()
  if (waiting === 0 && current.allRunAt === null) {
    current.allRunAt = now
  }
  const watched = current.allRunAt !== null && now - current.allRunAt >= RESUME_WATCH_MS
  // Why both: every failure that already came back ends the watch early.
  const allFailed = waiting === 0 && failedCount(current) === current.panes.length
  if (!watched && !allFailed && now < current.deadline) {
    return
  }
  batch = null
  current.stop()
  showResult(current, waiting)
}

/** One toast for every restart in flight: progress first, then how many restarted and how many failed. */
export function announceRestart(
  panes: readonly RestartingPane[],
  account: string,
  others: number,
  review: (() => void) | undefined
): void {
  if (panes.length === 0) {
    return
  }
  if (batch) {
    const known = new Set(batch.panes.map((pane) => pane.ptyId))
    batch.panes.push(...panes.filter((pane) => !known.has(pane.ptyId)))
    batch.account = account
    batch.allRunAt = null
    batch.deadline = Date.now() + RESTART_SETTLE_MS
    if (others > 0) {
      batch.extra = notMovedExtra(others, review)
    }
    showProgress(batch)
    return
  }
  const now = Date.now()
  const stopStore = useAppStore.subscribe(settle)
  const stopFailures = subscribeClaudeResumeFailures(settle)
  // Why a tick: settling also waits on time passing, which no store change reports.
  const tick = setInterval(settle, 1_000)
  batch = {
    panes: [...panes],
    account,
    extra: notMovedExtra(others, review),
    startedAt: now,
    deadline: now + RESTART_SETTLE_MS,
    allRunAt: null,
    stop: () => {
      stopStore()
      stopFailures()
      clearInterval(tick)
    }
  }
  showProgress(batch)
}

export function resetClaudeAccountRestartToastForTests(): void {
  batch?.stop()
  batch = null
}
