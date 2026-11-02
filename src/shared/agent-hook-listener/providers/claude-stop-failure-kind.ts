import type { AgentFailureKind } from '../../main-agent-status'

/** StopFailure `error` values the user can clear without a bug fix; other types stay plain failures. */
export function claudeStopFailureKind(error: unknown): AgentFailureKind | undefined {
  switch (error) {
    case 'authentication_failed':
    case 'oauth_org_not_allowed':
      return 'sign-in'
    case 'rate_limit':
      return 'usage-limit'
    case 'overloaded':
      return 'overloaded'
    default:
      return undefined
  }
}
