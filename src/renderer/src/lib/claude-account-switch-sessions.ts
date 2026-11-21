import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { CodexAccountSelectionTarget } from '../../../shared/codex-selection-lane'
import type { ClaudeAccountSwitchRunningSessions } from '../../../shared/claude-account-switch-settings'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'
import { getClaudeAccountLabel } from './claude-account-label'
import { announceRestart, type RestartingPane } from './claude-account-restart-toast'
import { findClaudeLoginFollowers } from './claude-login-followers'
import { setClaudeLoginUnmovedPanes } from './claude-login-unmoved-panes'
import {
  findClaudeSessionsStoppedAtUsageLimit,
  markContinueAfterRestart
} from './claude-usage-limit-sessions'
import type { ClaudeHostFolders } from './claude-pane-account-folder'
import {
  claudeLaunchAccountId,
  findClaudeSwitchSessions,
  findQueuedClaudeRestartsOnAccount,
  type ClaudeSessionMoveCandidate,
  type ClaudeSwitchSessions
} from './claude-session-account-move'

export type ClaudeAccountSwitchPromptSessions = {
  onAccount: ClaudeSessionMoveCandidate[]
  elsewhere: (ClaudeSessionMoveCandidate & { accountLabel: string })[]
  cantMove: ClaudeSwitchSessions['cantMove']
}

export type ClaudeAccountSwitchPrompt = {
  id: number
  sessions: ClaudeAccountSwitchPromptSessions
  /** Opened from the restart toast: the outgoing account's sessions are already restarting. */
  review?: true
  previousAccountLabel: string
  nextAccountLabel: string
}

let switchGeneration = 0
let prompt: ClaudeAccountSwitchPrompt | null = null
const promptListeners = new Set<() => void>()

function setPrompt(next: ClaudeAccountSwitchPrompt | null): void {
  prompt = next
  for (const listener of promptListeners) {
    listener()
  }
}

export function getClaudeAccountSwitchPrompt(): ClaudeAccountSwitchPrompt | null {
  return prompt
}

export function subscribeClaudeAccountSwitchPrompt(listener: () => void): () => void {
  promptListeners.add(listener)
  return () => promptListeners.delete(listener)
}

function queueClaudeRestarts(ptyIds: string[]): void {
  useAppStore.getState().queuePaneAccountRestarts(ptyIds, 'claude')
}

/**
 * Restart these sessions on the selected account. Those stopped at their usage limit, picker included,
 * get a continue line once resumed. All are queued together; each runs as soon as its turn allows.
 */
async function restartClaudeSessions(
  sessions: readonly ClaudeSessionMoveCandidate[],
  announce: RestartAnnouncement
): Promise<void> {
  const stopped = await findClaudeSessionsStoppedAtUsageLimit(sessions)
  queueClaudeRestartsWithContinue(sessions, stopped, announce)
}

type RestartAnnouncement = {
  account: string
  others?: number
  review?: () => void
  /** The continue line; the window's own wording when absent. */
  continueText?: string
}

/** Queue the restarts already sorted out; `stopped` get the continue line once resumed. */
export function queueClaudeRestartsWithContinue(
  sessions: readonly ClaudeSessionMoveCandidate[],
  stopped: readonly ClaudeSessionMoveCandidate[],
  announce: RestartAnnouncement
): void {
  const panes = currentPanes(sessions)
  const stoppedPtyIds = currentPanes(stopped).map((pane) => pane.ptyId)
  markContinueAfterRestart(stoppedPtyIds, announce.continueText)
  queueClaudeRestarts(panes.map((pane) => pane.ptyId))
  announceRestart(panes, announce.account, announce.others ?? 0, announce.review)
}

/** Why now: a reattach can rebind a pane while the dialog is open, and a closed pane has none. */
function currentPanes(sessions: readonly ClaudeSessionMoveCandidate[]): RestartingPane[] {
  const layouts = useAppStore.getState().terminalLayoutsByTabId
  return sessions.flatMap((session) => {
    const ptyId = layouts[session.tabId]?.ptyIdsByLeafId?.[session.leafId]
    return ptyId ? [{ ptyId, tabId: session.tabId, leafId: session.leafId }] : []
  })
}

/** Answers the open dialog. "Don't ask again" only turns restarts on, as native chat's resume prompt does. */
export function answerClaudeAccountSwitchPrompt(
  answer: 'restart' | 'keep',
  options: {
    /** The sessions the user ticked; every listed session when absent. */
    ptyIds?: readonly string[]
    dontAskAgain?: boolean
  } = {}
): void {
  const request = prompt
  if (!request) {
    return
  }
  setPrompt(null)
  if (answer === 'restart') {
    const chosen = options.ptyIds
    // Why filtered: only sessions this question listed may restart.
    const listed = [...request.sessions.onAccount, ...request.sessions.elsewhere]
    const picked = chosen ? listed.filter((session) => chosen.includes(session.ptyId)) : listed
    void restartClaudeSessions(picked, { account: request.nextAccountLabel })
  }
  if (options.dontAskAgain) {
    void useAppStore.getState().updateSettings({ claudeAccountSwitchRunningSessions: 'restart' })
  }
}

export type ClaudeAccountSnapshot = {
  state: ClaudeHostFolders
  accountId: string | null
}

/** After account selection applies, ask/restart/retain sessions on the outgoing account; show-confirmation leaves the caller’s toast. */
export async function handleRunningClaudeSessionsAfterSwitch(args: {
  owner: RuntimeClientTarget
  target: CodexAccountSelectionTarget
  before: ClaudeAccountSnapshot
  after: ClaudeAccountSnapshot
}): Promise<'show-confirmation' | 'handled'> {
  const fromAccountId = claudeLaunchAccountId(args.before.state, args.before.accountId)
  const toAccountId = claudeLaunchAccountId(args.after.state, args.after.accountId)
  // Why: a server's switch, or one between coinciding launch folders, moves nothing here.
  if (args.owner.kind !== 'local' || fromAccountId === toAccountId) {
    return 'show-confirmation'
  }
  const generation = ++switchGeneration
  setPrompt(null)
  // Why the new list: main read its folders and logins as it applied the switch.
  const host = args.after.state
  // Why: an accepted restart relaunches on whatever is selected when it runs, so it outlives switches.
  const store = useAppStore.getState()
  for (const ptyId of findQueuedClaudeRestartsOnAccount({
    owner: args.owner,
    target: args.target,
    accountId: toAccountId,
    host
  })) {
    store.consumePendingPaneAccountRestart(ptyId)
  }
  if (readPolicy() === 'keep') {
    return 'show-confirmation'
  }
  let uncheckedCount = 0
  let unmoved: ClaudeSessionMoveCandidate[] = []
  const found = await findClaudeSwitchSessions({
    owner: args.owner,
    target: args.target,
    fromAccountId,
    toAccountId,
    host,
    onUnchecked: (sessions) => {
      uncheckedCount = sessions.length
      unmoved = sessions
      console.warn(
        '[claude-account-switch] could not read the foreground of',
        sessions.map((session) => session.ptyId)
      )
    }
  }).catch((error: unknown) => {
    console.warn('[claude-account-switch] session scan failed:', error)
    return null
  })
  if (generation !== switchGeneration) {
    return 'handled'
  }
  // Why re-read: the setting may change while the scan runs.
  const policy = readPolicy()
  if (policy === 'keep') {
    return 'show-confirmation'
  }
  setClaudeLoginUnmovedPanes(unmoved)
  if (uncheckedCount > 0) {
    warnUncheckedSessions(
      uncheckedCount,
      getClaudeAccountLabel(args.before.state, args.before.accountId)
    )
  }
  if (!found) {
    return 'show-confirmation'
  }
  const nextAccountLabel = getClaudeAccountLabel(args.after.state, args.after.accountId)
  const sessions: ClaudeAccountSwitchPromptSessions = {
    ...found,
    elsewhere: found.elsewhere.map((session) => ({
      ...session,
      accountLabel: getClaudeAccountLabel(args.after.state, session.accountId)
    }))
  }
  const labels = {
    previousAccountLabel: getClaudeAccountLabel(args.before.state, args.before.accountId),
    nextAccountLabel
  }
  // Why: a session stopped at its usage limit cannot continue where it is, whatever folder it ran
  // in, so it moves without a question; staying put is the one thing that never helps it.
  const stranded = found.cantMove.filter((session) => session.resumable)
  const strandedStopped = await findClaudeSessionsStoppedAtUsageLimit(stranded)
  if (generation !== switchGeneration) {
    return 'handled'
  }
  const notMoving = found.cantMove.length - strandedStopped.length
  if (policy === 'limited') {
    const stopped = await findClaudeSessionsStoppedAtUsageLimit([
      ...found.onAccount,
      ...found.elsewhere,
      ...strandedStopped
    ])
    if (stopped.length > 0 && generation === switchGeneration) {
      await restartClaudeSessions(stopped, { account: nextAccountLabel })
    }
    return 'handled'
  }
  if (policy === 'restart') {
    // Why every account: whichever way the account changed, all of this Mac's Claude sessions follow it.
    const moving = [...found.onAccount, ...found.elsewhere, ...strandedStopped]
    if (moving.length === 0) {
      return 'show-confirmation'
    }
    await restartClaudeSessions(moving, {
      account: nextAccountLabel,
      others: notMoving,
      review: () => {
        if (generation === switchGeneration) {
          setPrompt({
            id: generation,
            review: true,
            sessions: { ...sessions, onAccount: [], elsewhere: [] },
            ...labels
          })
        }
      }
    })
    return 'handled'
  }
  // Asking: sessions stopped at their limit move now; only the ones still working wait on the answer.
  const stoppedNow = await findClaudeSessionsStoppedAtUsageLimit([
    ...found.onAccount,
    ...found.elsewhere,
    ...strandedStopped
  ])
  if (generation !== switchGeneration) {
    return 'handled'
  }
  if (stoppedNow.length > 0) {
    await restartClaudeSessions(stoppedNow, { account: nextAccountLabel })
  }
  const moved = new Set(stoppedNow.map((session) => session.ptyId))
  const asking: ClaudeAccountSwitchPromptSessions = {
    onAccount: sessions.onAccount.filter((session) => !moved.has(session.ptyId)),
    elsewhere: sessions.elsewhere.filter((session) => !moved.has(session.ptyId)),
    cantMove: sessions.cantMove.filter((session) => !moved.has(session.ptyId))
  }
  // Why: other sessions are listed only alongside a move, so parallel-account users get no prompt.
  if (asking.onAccount.length === 0) {
    return stoppedNow.length > 0 ? 'handled' : 'show-confirmation'
  }
  setPrompt({ id: generation, sessions: asking, ...labels })
  return 'handled'
}

/** After `/login` in one pane, ask/restart/retain the other running sessions on that pane's folder. */
export async function handleRunningClaudeSessionsAfterLogin(args: {
  paneKey: string
  host?: ClaudeHostFolders
}): Promise<'handled' | 'nothing'> {
  if (readPolicy() === 'keep') {
    return 'nothing'
  }
  const generation = ++switchGeneration
  setPrompt(null)
  let unmoved: ClaudeSessionMoveCandidate[] = []
  const found = await findClaudeLoginFollowers({
    loginPaneKey: args.paneKey,
    host: args.host,
    onUnchecked: (sessions) => {
      unmoved = sessions
    }
  }).catch((error: unknown) => {
    console.warn('[claude-login-sync] session scan failed:', error)
    return null
  })
  const policy = readPolicy()
  if (generation === switchGeneration && policy !== 'keep') {
    setClaudeLoginUnmovedPanes(unmoved)
  }
  if (
    generation !== switchGeneration ||
    !found ||
    found.sessions.length === 0 ||
    policy === 'keep'
  ) {
    return 'nothing'
  }
  const nextAccountLabel =
    found.accountId === null && args.host?.systemDefaultEmail
      ? args.host.systemDefaultEmail
      : getClaudeAccountLabel(args.host ?? { accounts: [] }, found.accountId)
  if (policy === 'restart' || policy === 'limited') {
    const restarting =
      policy === 'limited'
        ? await findClaudeSessionsStoppedAtUsageLimit(found.sessions)
        : found.sessions
    if (restarting.length === 0 || generation !== switchGeneration) {
      return 'nothing'
    }
    await restartClaudeSessions(restarting, { account: nextAccountLabel })
    return 'handled'
  }
  setPrompt({
    id: generation,
    sessions: { onAccount: found.sessions, elsewhere: [], cantMove: [] },
    previousAccountLabel: translate(
      'accounts.claude.loginSync.previousLogin',
      'the previous login'
    ),
    nextAccountLabel
  })
  return 'handled'
}

/** Why a toast: these sessions keep the previous account, and only a manual restart moves them. */
function warnUncheckedSessions(count: number, previous: string): void {
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

function readPolicy(): ClaudeAccountSwitchRunningSessions {
  return useAppStore.getState().settings?.claudeAccountSwitchRunningSessions ?? 'ask'
}

export function resetClaudeAccountSwitchSessionsForTests(): void {
  switchGeneration = 0
  setPrompt(null)
}
