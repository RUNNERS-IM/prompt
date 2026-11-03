import { MAX_TIMER_DELAY_MS } from '../../shared/timer-delay'
import { ORCHESTRATION_MESSAGE_WAIT_DEFAULT_TIMEOUT_MS } from '../../shared/orchestration-message-wait-timeout'

// Launches can chain workspace setup, agent readiness and prompt verification under one RPC.
const AGENT_LAUNCH_DEADLINE_MS = 5 * 60_000

export function isWaitingCheck(params: unknown): boolean {
  return (
    typeof params === 'object' &&
    params !== null &&
    'wait' in params &&
    (params as { wait: unknown }).wait === true
  )
}

export function getTimeoutMsParam(params: unknown): unknown {
  if (typeof params !== 'object' || params === null || !('timeoutMs' in params)) {
    return undefined
  }
  return (params as { timeoutMs?: unknown }).timeoutMs
}

/** The server-side wait of a long poll, or 0; a waiting check without --timeout-ms uses the server default. */
export function resolveLongPollWaitMs(method: string, params: unknown): number {
  const waitingCheck = method === 'orchestration.check' && isWaitingCheck(params)
  if (!waitingCheck && method !== 'terminal.wait') {
    return 0
  }
  const requested = Number(getTimeoutMsParam(params))
  if (Number.isFinite(requested) && requested > 0) {
    return requested
  }
  return waitingCheck ? ORCHESTRATION_MESSAGE_WAIT_DEFAULT_TIMEOUT_MS : 0
}

/** Keepalives only refresh the idle timer; by default a request may not outlive twice its timeout. */
export function defaultRuntimeRequestDeadlineMs(timeoutMs: number): number {
  return Math.min(timeoutMs * 2, MAX_TIMER_DELAY_MS)
}

/** The absolute limit keepalives cannot extend; null only for waits the server leaves unbounded. */
export function resolveRequestDeadlineMs(
  method: string,
  params: unknown,
  timeoutMs: number
): number | null {
  const requested = Number(getTimeoutMsParam(params))
  const explicit = Number.isFinite(requested) && requested > 0
  // `terminal wait --for exit` without --timeout-ms waits for the process however long it runs.
  if (
    method === 'terminal.wait' &&
    !explicit &&
    (params as { for?: unknown } | undefined)?.for !== 'tui-idle'
  ) {
    return null
  }
  // An explicit --timeout-ms already sized the transport timeout with its grace.
  if (explicit) {
    return timeoutMs
  }
  const deadlineMs = defaultRuntimeRequestDeadlineMs(timeoutMs)
  if (method === 'agent.launch' || method === 'agent.launchReplay') {
    return Math.max(deadlineMs, AGENT_LAUNCH_DEADLINE_MS)
  }
  return deadlineMs
}
