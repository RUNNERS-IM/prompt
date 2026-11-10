import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import type { RuntimeTerminalAgentActivity } from '../../shared/runtime-terminal-contracts'

/** A finished turn stays finished when it goes quiet; any other silence proves nothing. */
export function selectRuntimeAgentActivityForPane(
  rows: readonly AgentStatusIpcPayload[],
  liveState: AgentStatusIpcPayload['state'] | undefined
): RuntimeTerminalAgentActivity | undefined {
  if (liveState) {
    return liveState
  }
  const reported = rows.filter((row) => row.providerSessionOnly !== true)
  if (reported.length === 0) {
    return undefined
  }
  const latest = reported.reduce((a, b) => (b.receivedAt > a.receivedAt ? b : a))
  return latest.state === 'done' ? 'done' : 'no-update'
}
