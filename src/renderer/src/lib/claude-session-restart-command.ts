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
  launchAccountId: string | null
): Decision {
  const folder = resolveClaudePaneFolder(
    pane.transcriptPath,
    useAppStore.getState().settings?.claudeManagedAccounts ?? [],
    host
  )
  if (!folder) {
    return { outcome: 'skipped', reason: 'unknown-account' }
  }
  // Why: the pane keeps its own CLAUDE_CONFIG_DIR, so a restart lands in the same folder.
  if (folder.kind === 'own-folder') {
    return { outcome: 'skipped', reason: 'own-folder' }
  }
  const onSelected = isClaudePaneOnAccount(folder, launchAccountId, host)
  if (onSelected && !isHeldAtUsageLimitPicker(pane.ptyId)) {
    return { outcome: stopped ? 'continued' : 'current' }
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
    const decision = decide(pane, limited, host, launchAccountId)
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
