import { translate } from '@/i18n/i18n'
import type { AgentFailureKind } from '../../../shared/main-agent-status'
import {
  agentMainAgentVerdict,
  agentRetryableFailureKind,
  agentVerdictDisplayMark,
  type AgentMainAgentVerdictSource
} from '../../../shared/agent-main-agent-verdict'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import { isProgramStatusRow } from './program-status/row'

type VerdictLineSource = AgentMainAgentVerdictSource &
  Partial<
    Pick<AgentStatusEntry, 'lastAssistantMessage' | 'agentType' | 'programStatus' | 'observation'>
  >

/** Replace previews with the verdict: user Stop, interruption by a newer request, or crash failure. */
export function agentVerdictStatusLine(entry: VerdictLineSource): string | null {
  switch (agentVerdictDisplayMark(entry)) {
    case 'failed': {
      const kind = agentRetryableFailureKind(entry)
      return kind ? retryableFailureLine(kind) : failedLine(entry)
    }
    case 'interrupted':
      return agentMainAgentVerdict(entry) === 'cancellation' ? 'Interrupted by user' : 'Interrupted'
    case 'unconfirmed':
      return 'Couldn’t confirm'
    case null:
      return null
  }
}

function retryableFailureLine(kind: AgentFailureKind): string {
  switch (kind) {
    case 'sign-in':
      return translate('prompt.sessionRow.failure.signIn', 'Sign-in needed')
    case 'usage-limit':
      return translate('prompt.sessionRow.failure.usageLimit', 'Usage limit reached')
    case 'overloaded':
      return translate('prompt.sessionRow.failure.overloaded', 'Server busy')
  }
}

// Only program errors are reliable one-line failure summaries; agent replies may be unrelated prose.
function failedLine(entry: VerdictLineSource): string {
  if (!isProgramStatusRow(entry)) {
    return 'Failed'
  }
  const message = entry.lastAssistantMessage?.trim() || entry.programStatus?.message
  return message ? `Failed: ${message}` : 'Failed'
}
