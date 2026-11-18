import type React from 'react'
import { agentStateLabel } from '@/components/AgentStateDot'
import type { TerminalTabActivityStatus } from './terminal-tab-activity-status'
import { terminalTabActivityToAgentDotState } from './terminal-tab-activity-status'

/** Prompt: the tab hover card names the tab's state in words ("Working", "Waiting for input"…), so the
 *  state is not told by the icon's color alone. Other details follow it unchanged. */
export function tabHoverStatusDetails(
  activityStatus: TerminalTabActivityStatus,
  details: React.ReactNode
): React.ReactNode {
  const state = terminalTabActivityToAgentDotState(activityStatus)
  if (!state) {
    return details
  }
  return (
    <>
      <div className="text-muted-foreground" data-tab-hover-card-status>
        {agentStateLabel(state)}
      </div>
      {details}
    </>
  )
}
