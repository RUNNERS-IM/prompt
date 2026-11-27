import { watchBareShellClaudeRestore, watchClaudeResumeStart } from '@/lib/claude-resume-failure'
import type { AgentAccountRestartStartup } from '@/lib/agent-account-restart-startup'
import type { ColdRestoreAgentResumeStartup } from './fresh-spawn-types'
import type { ConnectPanePtySession } from './connect-pane-pty-session'
import type { PtyPaneStartup } from '../pty-connection-types'

type ResumeStartup = ColdRestoreAgentResumeStartup | PtyPaneStartup

/** 다시 열 Claude 명령. 아니면 null. */
function toClaudeRetryStartup(
  startup: ResumeStartup | null | undefined
): AgentAccountRestartStartup | null {
  const agent = startup && ('agent' in startup ? startup.agent : startup.launchAgent)
  if (!startup || agent !== 'claude' || !startup.resumeProviderSession) {
    return null
  }
  // Why dropped: a launch token is spent by the launch that carried it.
  const { ORCA_AGENT_LAUNCH_TOKEN: _spent, ...env } = startup.env ?? {}
  return {
    command: startup.command,
    startupCommandDelivery: 'shell-ready',
    launchAgent: 'claude',
    env,
    ...(startup.launchConfig ? { launchConfig: startup.launchConfig } : {}),
    resumeProviderSession: startup.resumeProviderSession
  }
}

/** Starts the failure watch when this launch resumed a recorded Claude conversation. */
export function watchClaudeResumeFromStartup(
  session: ConnectPanePtySession,
  ptyId: string,
  startup: ResumeStartup | null | undefined
): boolean {
  const retry = toClaudeRetryStartup(startup)
  if (!retry) {
    return false
  }
  watchClaudeResumeStart({
    tabId: session.deps.tabId,
    leafId: session.pane.leafId,
    ptyId,
    startup: retry
  })
  return true
}

/** 맨 셸로 복원된 Claude 탭이면 45초 뒤에도 셸일 때 한 번 다시 열도록 지켜본다. */
export function watchBareShellClaudeFromSession(
  session: ConnectPanePtySession,
  ptyId: string
): void {
  const retry = toClaudeRetryStartup(session.bareShellClaudeResume)
  session.bareShellClaudeResume = null
  if (!retry) {
    return
  }
  watchBareShellClaudeRestore({
    tabId: session.deps.tabId,
    leafId: session.pane.leafId,
    ptyId,
    startup: retry
  })
}
