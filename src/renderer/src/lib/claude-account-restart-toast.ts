import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { INLINE_ACTION_CLASS_NAMES } from '@/components/ui/sonner'
import {
  getClaudeResumeFailures,
  isClaudeResumeStartPending,
  subscribeClaudeResumeFailures
} from './claude-resume-failure'

export type RestartingPane = { ptyId: string; tabId: string; leafId: string }

// 다시 시작은 한 장의 알림으로 묶는다(사용자 답 2A). 진행 중에 또 시작하면 같은 알림에 더한다.
const RESTART_TOAST_ID = 'claude-account-restart'
// 모두 다시 연 뒤 각 창의 다시 열기 감시가 시작될 때까지 기다리는 시간. 그 뒤로는 감시가 모두 끝나면 결과를 낸다.
const RESUME_WATCH_START_MS = 3_000
// 이 시간이 지나도 남은 세션은 하던 턴이 끝나거나 탭이 열릴 때 다시 시작된다고 알리고 알림을 닫는다.
const RESTART_SETTLE_MS = 2 * 60_000
// 진행 중에 다시 시작이 또 들어오면 기한을 늘리지만, 처음 시작에서 이 시간을 넘기지는 않는다.
// 한도에 멈춘 세션을 20초 간격으로 하나씩 이어 가거나 명령줄 다시 시작이 잇달아 오면 기한이 끝없이 밀려
// 「다시 시작하는 중」 알림이 사라지지 않았다(2026-11-27 사용자: 「이거 왜 안사라지냐」).
const RESTART_MAX_MS = 5 * 60_000
const RESULT_MS = 5_000

type Extra = {
  description?: string
  classNames?: typeof INLINE_ACTION_CLASS_NAMES
  action?: { label: string; onClick: () => void }
  cancel?: { label: string; onClick: () => void }
}

/** The sessions the switch left behind, by name and reason, and how to move the ones it can. */
export type NotMovedSessions = {
  /** "name (reason)" for each, in list order. */
  lines: readonly string[]
  /** Restarts those a restart can move; absent when none can. */
  moveAll?: () => void
}

// 알림에 이름을 몇 개까지 적을지. 나머지는 「외 N개」로 줄이고 검토 창에서 모두 본다.
const NOT_MOVED_NAMES_SHOWN = 3

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

function notMovedNames(lines: readonly string[]): string {
  const shown = lines.slice(0, NOT_MOVED_NAMES_SHOWN).join(', ')
  const rest = lines.length - NOT_MOVED_NAMES_SHOWN
  return rest > 0
    ? translate(
        'accounts.claude.switchSessions.notMovedNamesMore',
        '{{names}} and {{count}} more',
        {
          names: shown,
          count: rest
        }
      )
    : shown
}

function notMovedExtra(
  others: number,
  review: (() => void) | undefined,
  notMoved?: NotMovedSessions
): Extra {
  if (others === 0 || !review) {
    return {}
  }
  const reviewButton = {
    label: translate('accounts.claude.switchSessions.review', 'Review'),
    onClick: review
  }
  const summary =
    others === 1
      ? translate('accounts.claude.switchSessions.notMovedOne', "1 other session wasn't moved.")
      : translate(
          'accounts.claude.switchSessions.notMovedOther',
          "{{count}} other sessions weren't moved.",
          { count: others }
        )
  const names = notMoved && notMoved.lines.length > 0 ? notMovedNames(notMoved.lines) : ''
  return {
    description: names ? `${summary} ${names}` : summary,
    classNames: INLINE_ACTION_CLASS_NAMES,
    ...(notMoved?.moveAll
      ? {
          action: {
            label: translate('accounts.claude.switchSessions.moveAll', 'Move all'),
            onClick: notMoved.moveAll
          },
          cancel: reviewButton
        }
      : { action: reviewButton })
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
  // Why wait on the watch: a resume that can't find its conversation is only called failed once it settles.
  const watched =
    current.allRunAt !== null &&
    now - current.allRunAt >= RESUME_WATCH_START_MS &&
    !current.panes.some((pane) => isClaudeResumeStartPending(pane.tabId, pane.leafId))
  if (!watched && now < current.deadline) {
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
  review: (() => void) | undefined,
  notMoved?: NotMovedSessions
): void {
  if (panes.length === 0) {
    return
  }
  if (batch) {
    const known = new Set(batch.panes.map((pane) => pane.ptyId))
    batch.panes.push(...panes.filter((pane) => !known.has(pane.ptyId)))
    batch.account = account
    batch.allRunAt = null
    batch.deadline = Math.min(Date.now() + RESTART_SETTLE_MS, batch.startedAt + RESTART_MAX_MS)
    if (others > 0) {
      batch.extra = notMovedExtra(others, review, notMoved)
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
    extra: notMovedExtra(others, review, notMoved),
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

/** Terminals whose foreground could not be read, so a Claude there may still be on the old account. */
export function warnUncheckedSessions(count: number, previous: string): void {
  toast.warning(
    count === 1
      ? translate(
          'accounts.claude.switchSessions.uncheckedOne',
          "Couldn't check 1 terminal for Claude. If Claude is running there, it stays on {{previous}} until restarted.",
          { previous }
        )
      : translate(
          'accounts.claude.switchSessions.uncheckedOther',
          "Couldn't check {{count}} terminals for Claude. Any Claude running there stays on {{previous}} until restarted.",
          { count, previous }
        )
  )
}

export function resetClaudeAccountRestartToastForTests(): void {
  batch?.stop()
  batch = null
}
