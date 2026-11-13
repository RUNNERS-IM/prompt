import { useAppStore } from '@/store'
import { agentRetryableFailureKind } from '../../../shared/agent-main-agent-verdict'
import { makePaneKey } from '../../../shared/stable-pane-id'
import type { ClaudeSessionMoveCandidate } from './claude-session-account-move'

/** Why only these: a session still working keeps its account, while one stopped at the limit can only continue elsewhere. */
export function isStoppedAtUsageLimit(candidate: ClaudeSessionMoveCandidate): boolean {
  const row =
    useAppStore.getState().agentStatusByPaneKey[makePaneKey(candidate.tabId, candidate.leafId)]
  return row ? agentRetryableFailureKind(row) === 'usage-limit' : false
}
