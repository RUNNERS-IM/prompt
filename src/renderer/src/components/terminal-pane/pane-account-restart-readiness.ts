import type { AppState } from '@/store'
import { isClaudePaneMidTurn } from '@/lib/claude-session-account-move'
import { isHeldAtUsageLimitPicker } from '@/lib/claude-usage-limit-sessions'
import { agentRetryableFailureKind } from '../../../../shared/agent-main-agent-verdict'
import { makePaneKey } from '../../../../shared/stable-pane-id'

/**
 * Why the limit: Claude waiting on its usage-limit choice, or whose turn the hook reported as stopped
 * at the limit, can still read as mid-turn, yet only a restart moves it on.
 */
export function isClaudeRestartReady(
  state: AppState,
  tabId: string,
  leafId: string,
  ptyId: string
): boolean {
  const paneKey = makePaneKey(tabId, leafId)
  if (!isClaudePaneMidTurn(state, paneKey) || isHeldAtUsageLimitPicker(ptyId)) {
    return true
  }
  const row = state.agentStatusByPaneKey[paneKey]
  return !!row && agentRetryableFailureKind(row) === 'usage-limit'
}

/** PTYs whose queued account restart can run now: Codex at once, this tab's Claude once its turn ends. */
export function selectReadyAccountRestartPtyIds(state: AppState, tabId: string): string[] {
  const pending = state.pendingPaneAccountRestarts
  const ready = Object.keys(pending).filter((ptyId) => pending[ptyId] === 'codex')
  const ptyIdsByLeafId = state.terminalLayoutsByTabId[tabId]?.ptyIdsByLeafId ?? {}
  for (const [leafId, ptyId] of Object.entries(ptyIdsByLeafId)) {
    if (pending[ptyId] === 'claude' && isClaudeRestartReady(state, tabId, leafId, ptyId)) {
      ready.push(ptyId)
    }
  }
  return ready
}

/** Whether `ptyId`'s queued restart can run against the store as it is now. */
export function isAccountRestartReady(
  state: AppState,
  tabId: string,
  leafId: string,
  ptyId: string
): boolean {
  const queued = state.pendingPaneAccountRestarts[ptyId]
  return (
    queued === 'codex' || (queued === 'claude' && isClaudeRestartReady(state, tabId, leafId, ptyId))
  )
}
