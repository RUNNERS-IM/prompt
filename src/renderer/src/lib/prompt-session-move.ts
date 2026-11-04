import { toast } from 'sonner'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { translate } from '@/i18n/i18n'
import { openPromptSessionCopyInWorkspace } from '@/lib/prompt-windows'
import { resolvePaneAgentSessionId } from '@/components/terminal-pane/pane-agent-session-id'
import { resolvePromptMovableSessionId } from '@/lib/prompt-session-copy-origin'
import { closePromptSession } from '@/components/sidebar/prompt-sidebar-session-actions'
import { locateTerminalTab } from '@/store/terminals/terminal-tab-location'
import { promptClaudeSessionCopyCommand } from '../../../shared/prompt-windows'
import {
  promptPendingSessionMoveOf,
  registerPromptPendingSessionMove
} from '@/lib/prompt-session-move-pending'

/** How long a working conversation may take to finish its turn before the move gives up. */
export const PROMPT_SESSION_MOVE_IDLE_TIMEOUT_MS = 30 * 60_000
/** How long the copy in the target may take to report its own conversation id. */
export const PROMPT_SESSION_MOVE_START_TIMEOUT_MS = 90_000

export type PromptSessionMoveRequest = {
  sourceWorktreeId: string
  sourceTabId: string
  /** The pane that runs the Claude conversation being moved. */
  paneKey: string
  targetWorktreeId: string
}

export type PromptSessionMoveOutcome =
  | { moved: true; tabId: string }
  | {
      moved: false
      reason:
        | 'source-gone'
        | 'no-session'
        | 'still-working'
        | 'copy-failed'
        | 'not-started'
        | 'cancelled'
        | 'already-moving'
    }

/** Tabs of one terminal tab's panes are keyed "<tabId>:<leafId>". */
function paneKeysOfTab(state: Pick<AppState, 'agentStatusByPaneKey'>, tabId: string): string[] {
  return Object.keys(state.agentStatusByPaneKey).filter((key) => key.startsWith(`${tabId}:`))
}

/** The conversation is mid-turn; moving it now would leave the rest of that turn behind. */
export function isPromptPaneWorking(
  state: Pick<AppState, 'agentStatusByPaneKey'>,
  paneKey: string
): boolean {
  return state.agentStatusByPaneKey[paneKey]?.state === 'working'
}

/** A conversation id a pane of `tabId` reports that is not `excludeId`, or null. */
export function startedSessionIdOfTab(
  state: Parameters<typeof resolvePaneAgentSessionId>[0] & Pick<AppState, 'agentStatusByPaneKey'>,
  tabId: string,
  excludeId: string
): string | null {
  for (const key of paneKeysOfTab(state, tabId)) {
    const id = resolvePaneAgentSessionId(state, key)
    if (id && id !== excludeId) {
      return id
    }
  }
  return null
}

/** How long the copy must stay loaded before the original closes (a failed resume exits fast). */
export const PROMPT_SESSION_MOVE_SETTLE_MS = 3_000

/**
 * The copy in `tabId` has loaded its conversation: a pane runs Claude in the foreground, finished
 * loading (done) or already working. A copy that never reports its own id until the next message
 * still counts; one stuck at a question (folder trust) or back at the shell does not.
 */
export function isPromptCopyLoaded(
  state: Pick<AppState, 'agentStatusByPaneKey' | 'paneForegroundAgentByPaneKey'>,
  tabId: string
): boolean {
  return paneKeysOfTab(state, tabId).some((key) => {
    const entry = state.agentStatusByPaneKey[key]
    return (
      entry?.agentType === 'claude' &&
      entry.restoredUnconfirmed !== true &&
      (entry.state === 'done' || entry.state === 'working') &&
      state.paneForegroundAgentByPaneKey[key]?.shellForeground !== true
    )
  })
}

/** Resolve once `done(state)` is true, or with false when `timeoutMs` passes or `signal` aborts first. */
export function waitForAppState(
  done: (state: AppState) => boolean,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<boolean> {
  if (signal?.aborted) {
    return Promise.resolve(false)
  }
  if (done(useAppStore.getState())) {
    return Promise.resolve(true)
  }
  return new Promise((resolve) => {
    let unsubscribe: () => void = () => {}
    const finish = (result: boolean): void => {
      clearTimeout(timer)
      unsubscribe()
      signal?.removeEventListener('abort', onAbort)
      resolve(result)
    }
    const onAbort = (): void => finish(false)
    const timer = setTimeout(() => finish(false), timeoutMs)
    signal?.addEventListener('abort', onAbort)
    unsubscribe = useAppStore.subscribe((state) => {
      if (done(state)) {
        finish(true)
      }
    })
  })
}

function sourceTabExists(state: AppState, tabId: string): boolean {
  return locateTerminalTab(state.tabsByWorktree, tabId) !== null
}

/** The project name as the sidebar shows it; a main worktree's own name is its branch. */
function workspaceLabel(state: AppState, worktreeId: string): string {
  const worktree = state.getKnownWorktreeById?.(worktreeId)
  const repo = worktree?.repoId ? state.repos?.find((r) => r.id === worktree.repoId) : undefined
  return (
    repo?.displayName || worktree?.displayName || worktree?.path?.split('/').pop() || worktreeId
  )
}

/**
 * Move a Claude conversation to another workspace (a sidebar row dropped there without ⌥).
 * Order matters so nothing is lost: wait until the conversation finishes its turn, start a copy
 * of it in the target (claude --resume <id> --fork-session), wait until that copy has loaded, and
 * only then close the original tab. Any step that fails leaves the original running and says why.
 * Until the original closes, the toast and the sidebar row offer Cancel.
 */
export async function movePromptClaudeSession(
  request: PromptSessionMoveRequest
): Promise<PromptSessionMoveOutcome> {
  const { sourceTabId, targetWorktreeId } = request
  if (promptPendingSessionMoveOf(sourceTabId)) {
    toast.info(
      translate('prompt.sessionMove.alreadyMoving', 'This session is already being moved.')
    )
    return { moved: false, reason: 'already-moving' }
  }
  const label = workspaceLabel(useAppStore.getState(), targetWorktreeId)
  const abort = new AbortController()
  const progressToastId = `prompt-session-move:${sourceTabId}`
  const unregister = registerPromptPendingSessionMove(sourceTabId, {
    targetLabel: label,
    cancel: () => abort.abort()
  })
  try {
    return await runMove(request, label, abort.signal, (message) =>
      toast.loading(message, {
        id: progressToastId,
        duration: Number.POSITIVE_INFINITY,
        action: {
          label: translate('prompt.sessionMove.cancel', 'Cancel'),
          onClick: () => abort.abort()
        }
      })
    )
  } finally {
    unregister()
    toast.dismiss(progressToastId)
  }
}

function noticeCancelled(label: string): PromptSessionMoveOutcome {
  toast.info(
    translate(
      'prompt.sessionMove.cancelled',
      "Move to '{{name}}' cancelled. The session stays where it was.",
      { name: label }
    )
  )
  return { moved: false, reason: 'cancelled' }
}

async function runMove(
  request: PromptSessionMoveRequest,
  label: string,
  signal: AbortSignal,
  showProgress: (message: string) => void
): Promise<PromptSessionMoveOutcome> {
  const { sourceWorktreeId, sourceTabId, paneKey, targetWorktreeId } = request

  if (isPromptPaneWorking(useAppStore.getState(), paneKey)) {
    showProgress(
      translate(
        'prompt.sessionMove.waiting',
        "This session is working. It will move to '{{name}}' when it finishes.",
        { name: label }
      )
    )
    const idle = await waitForAppState(
      (state) => !sourceTabExists(state, sourceTabId) || !isPromptPaneWorking(state, paneKey),
      PROMPT_SESSION_MOVE_IDLE_TIMEOUT_MS,
      signal
    )
    if (signal.aborted) {
      return noticeCancelled(label)
    }
    if (!idle) {
      toast.error(
        translate(
          'prompt.sessionMove.stillWorking',
          'The session kept working, so it was not moved.'
        )
      )
      return { moved: false, reason: 'still-working' }
    }
  }

  const state = useAppStore.getState()
  if (!sourceTabExists(state, sourceTabId)) {
    return { moved: false, reason: 'source-gone' }
  }
  const sessionId = resolvePromptMovableSessionId(state, paneKey)
  const command = sessionId ? promptClaudeSessionCopyCommand(sessionId) : null
  if (!sessionId || !command) {
    toast.error(
      translate('prompt.sessionMove.noSession', 'This session has no Claude conversation to move.')
    )
    return { moved: false, reason: 'no-session' }
  }

  showProgress(
    translate('prompt.sessionMove.opening', "Opening the session in '{{name}}'…", { name: label })
  )
  const tabId = openPromptSessionCopyInWorkspace(targetWorktreeId, command)
  if (!tabId) {
    toast.error(translate('prompt.sessionMove.copyFailed', 'The session could not be moved.'))
    return { moved: false, reason: 'copy-failed' }
  }

  const loaded = (current: AppState): boolean =>
    startedSessionIdOfTab(current, tabId, sessionId) !== null || isPromptCopyLoaded(current, tabId)
  let started = await waitForAppState(loaded, PROMPT_SESSION_MOVE_START_TIMEOUT_MS, signal)
  if (started && startedSessionIdOfTab(useAppStore.getState(), tabId, sessionId) === null) {
    // No id of its own yet: make sure the copy stays loaded rather than exiting right away.
    await waitForAppState(() => false, PROMPT_SESSION_MOVE_SETTLE_MS, signal)
    started = isPromptCopyLoaded(useAppStore.getState(), tabId)
  }
  if (signal.aborted) {
    // The copy never replaced the original; close it so only the original remains.
    closePromptSession(targetWorktreeId, tabId, { skipRunningConfirm: true })
    return noticeCancelled(label)
  }
  if (!started) {
    toast.error(
      translate(
        'prompt.sessionMove.notStarted',
        "The conversation did not open in '{{name}}', so the original tab was kept.",
        { name: label }
      )
    )
    return { moved: false, reason: 'not-started' }
  }

  closePromptSession(sourceWorktreeId, sourceTabId, { skipRunningConfirm: true })
  if (sourceTabExists(useAppStore.getState(), sourceTabId)) {
    // A pinned tab is not closed by a bulk close; the copy is open, so say the original stayed.
    toast.success(
      translate(
        'prompt.sessionMove.copiedPinned',
        "Opened in '{{name}}'. The original tab is pinned, so it was kept.",
        { name: label }
      )
    )
    return { moved: true, tabId }
  }
  toast.success(translate('prompt.sessionMove.moved', "Moved to '{{name}}'", { name: label }), {
    action: {
      label: translate('prompt.sessionMove.undo', 'Undo'),
      // The original conversation file is still on disk: reopen it where it was, close the copy.
      onClick: () => {
        if (openPromptSessionCopyInWorkspace(sourceWorktreeId, command)) {
          closePromptSession(targetWorktreeId, tabId, { skipRunningConfirm: true })
        }
      }
    }
  })
  return { moved: true, tabId }
}
