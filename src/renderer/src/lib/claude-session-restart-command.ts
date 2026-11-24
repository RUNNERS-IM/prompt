import { useAppStore } from '@/store'
import { getProviderAccountActiveIdForView } from '@/components/settings/provider-account-visibility'
import type { ClaudeRateLimitAccountsState } from '../../../shared/managed-account-types'
import type {
  PromptClaudeRestartOutcome,
  PromptClaudeRestartRequest,
  PromptClaudeRestartResult
} from '../../../shared/prompt-claude-login-sync'
import { resolveAgentAccountRestartResumeStartup } from './agent-account-restart-startup'
import { getClaudeAccountLabel } from './claude-account-label'
import { fillClaudePaneSessionsFromProcesses } from './claude-running-session-fill'
import { queueClaudeRestartsWithContinue } from './claude-account-switch-sessions'
import { isClaudePaneOnAccount, resolveClaudePaneFolder } from './claude-pane-account-folder'
import {
  claudeLaunchAccountId,
  localClaudePanes,
  type ClaudeSessionMoveCandidate,
  type LocalClaudePane
} from './claude-session-account-move'
import {
  claudeContinueLine,
  findClaudeSessionsStoppedAtUsageLimit,
  isHeldAtUsageLimitPicker,
  sendContinueWhenReady
} from './claude-usage-limit-sessions'

const HOST_VIEW = { runtime: 'host' } as const

type Decision = { outcome: PromptClaudeRestartOutcome; reason?: string }

function toCandidate(pane: LocalClaudePane): ClaudeSessionMoveCandidate {
  return { ptyId: pane.ptyId, worktreeId: pane.worktreeId, tabId: pane.tabId, leafId: pane.leafId }
}

/**
 * Sort each session by what moves it onto the selected account: a session already on that login
 * only needs the continue line, while one on another account folder, or held by the limit picker,
 * must restart there.
 */
function decide(
  pane: LocalClaudePane,
  stopped: boolean,
  host: ClaudeRateLimitAccountsState,
  launchAccountId: string | null,
  restartLimited: boolean
): Decision {
  const folder = resolveClaudePaneFolder(
    pane.transcriptPath,
    useAppStore.getState().settings?.claudeManagedAccounts ?? [],
    host
  )
  // Why stopped only: a session stopped at its limit goes nowhere where it is. Its folder may be
  // unread (no hook since Prompt reopened) or one Prompt no longer lists, such as `~/.claude` or a
  // removed account; the restart reads the selected-account pointer, so it moves all the same.
  // A running session there is left alone: its folder may be the user's own on purpose.
  if (!folder || folder.kind === 'own-folder') {
    if (!stopped) {
      return { outcome: 'skipped', reason: folder ? 'own-folder' : 'unknown-account' }
    }
  } else {
    const onSelected = isClaudePaneOnAccount(folder, launchAccountId, host)
    if (onSelected && !isHeldAtUsageLimitPicker(pane.ptyId) && !(restartLimited && stopped)) {
      return { outcome: stopped ? 'continued' : 'current' }
    }
  }
  const resumable = resolveAgentAccountRestartResumeStartup('claude', {
    tabId: pane.tabId,
    leafId: pane.leafId,
    worktreeId: pane.worktreeId,
    shellOverride: pane.tab.shellOverride
  })
  return resumable ? { outcome: 'restarting' } : { outcome: 'skipped', reason: 'no-session' }
}

export async function handleClaudeSessionRestartRequest(
  request: PromptClaudeRestartRequest,
  listAccounts: () => Promise<ClaudeRateLimitAccountsState>
): Promise<PromptClaudeRestartResult> {
  const host = await listAccounts()
  // Why: panes with no hook evidence would be skipped as unknown-account and have no resume id.
  await fillClaudePaneSessionsFromProcesses()
  const launchAccountId = claudeLaunchAccountId(
    host,
    getProviderAccountActiveIdForView(host, HOST_VIEW)
  )
  const wanted = request.panes
  const panes = [...localClaudePanes(useAppStore.getState(), { kind: 'local' }, HOST_VIEW)].filter(
    (pane) =>
      pane.inLane &&
      (!wanted || wanted.some((w) => w.tabId === pane.tabId && w.leafId === pane.leafId))
  )
  const stoppedPanes = new Set(await findClaudeSessionsStoppedAtUsageLimit(panes))
  const looked = request.limitedOnly ? panes.filter((pane) => stoppedPanes.has(pane)) : panes
  const continueText = request.continueText ?? claudeContinueLine()
  const restarting: LocalClaudePane[] = []
  const sessions: PromptClaudeRestartResult['sessions'] = []
  for (const pane of looked) {
    const limited = stoppedPanes.has(pane)
    const decision = decide(pane, limited, host, launchAccountId, request.restartLimited === true)
    sessions.push({ tabId: pane.tabId, leafId: pane.leafId, limited, ...decision })
    if (decision.outcome === 'restarting') {
      restarting.push(pane)
    } else if (decision.outcome === 'continued') {
      void sendContinueWhenReady(toCandidate(pane), continueText)
    }
  }
  if (restarting.length > 0) {
    queueClaudeRestartsWithContinue(
      restarting.map(toCandidate),
      restarting.filter((pane) => stoppedPanes.has(pane)).map(toCandidate),
      {
        account:
          launchAccountId === null && host.systemDefaultEmail
            ? host.systemDefaultEmail
            : getClaudeAccountLabel(host, launchAccountId),
        continueText
      }
    )
  }
  return { sessions }
}
