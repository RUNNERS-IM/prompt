import type { AgentStatusState } from './agent-status-types'
import type { AgentTurnOutcome } from './agent-turn-outcome'

/** Failures the user can clear without a bug fix: sign in again, wait out a limit, retry a busy server. */
export const AGENT_FAILURE_KINDS = ['sign-in', 'usage-limit', 'overloaded'] as const
export type AgentFailureKind = (typeof AGENT_FAILURE_KINDS)[number]

export function isAgentFailureKind(value: unknown): value is AgentFailureKind {
  return typeof value === 'string' && (AGENT_FAILURE_KINDS as readonly string[]).includes(value)
}

/** Main agent state, distinct from the row’s child-folded state (a settled main agent with live children still reads working).
 * Persisted and carried on every wire; preserve the shape. */
export type AgentMainAgentStatus = {
  state: AgentStatusState
  /** Latest finished-turn verdict, only while done; a new turn clears it. Provider-reported, inferred cancellation, or host-observed end.
   * Absent means unknown: never infer success from plain Stop, because older providers omit interrupt flags. */
  outcome?: AgentTurnOutcome
  /** Why a failed turn failed when the provider names a fix-it-yourself cause; only with done + failure, cleared with the verdict. */
  failureKind?: AgentFailureKind
  /** A user’s Stop is ending the working turn. Structured hosts publish it; readers display it without storing it. */
  stopping?: true
  /** When the main agent’s state began (ms); the row’s stateStartedAt dates its combined state and can differ while children run. */
  stateStartedAt: number
}

/** The main agent's own state where the row carries one; older rows only have the combined state. */
export function mainAgentState(row: {
  state: AgentStatusState
  mainAgent?: AgentMainAgentStatus
}): AgentStatusState {
  return row.mainAgent?.state ?? row.state
}

export function mainAgentStatusEqual(
  a: AgentMainAgentStatus | undefined,
  b: AgentMainAgentStatus | undefined
): boolean {
  if (a === b) {
    return true
  }
  if (!a || !b) {
    return false
  }
  return (
    a.state === b.state &&
    a.outcome === b.outcome &&
    a.failureKind === b.failureKind &&
    a.stopping === b.stopping &&
    a.stateStartedAt === b.stateStartedAt
  )
}
