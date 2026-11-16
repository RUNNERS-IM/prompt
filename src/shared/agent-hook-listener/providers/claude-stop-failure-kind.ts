import type { AgentFailureKind } from '../../main-agent-status'
import { isClaudeUsageLimitText } from '../../claude-usage-limit-screen'

/** StopFailure `error` values the user can clear without a bug fix; other types stay plain failures. */
export function claudeStopFailureKind(
  payload: Record<string, unknown>
): AgentFailureKind | undefined {
  switch (payload['error']) {
    case 'authentication_failed':
    case 'oauth_org_not_allowed':
      return 'sign-in'
    case 'rate_limit':
    case 'billing_error':
      return 'usage-limit'
    case 'overloaded':
      return 'overloaded'
    default:
      // Claude Code 2.1 은 한도에 닿아도 error 를 'rate_limit' 대신 'unknown' 으로 보내기도 해서 문장으로도 알아본다.
      return [payload['error_details'], payload['last_assistant_message']].some(
        (text) => typeof text === 'string' && isClaudeUsageLimitText(text)
      )
        ? 'usage-limit'
        : undefined
  }
}

// Claude's own limit notice is the whole reply (「You've hit your weekly limit · resets …」); prose that only mentions a limit is not.
const LIMIT_NOTICE =
  /^\s*(you'?ve (hit|reached) your\b[^\n]*\blimit|you'?re out of (usage|extra usage)|stopp?(ed)? (at|for) (the |your )?(usage )?limit)/i

/** A plain Stop whose reply is Claude's usage-limit notice: the turn ended at the limit, not done. */
export function isClaudeLimitStop(eventName: unknown, payload: Record<string, unknown>): boolean {
  const message = payload['last_assistant_message']
  return eventName === 'Stop' && typeof message === 'string' && LIMIT_NOTICE.test(message)
}
