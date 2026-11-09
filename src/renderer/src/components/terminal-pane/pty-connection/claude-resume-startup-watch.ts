import { watchClaudeResumeStart } from '@/lib/claude-resume-failure'
import type { ColdRestoreAgentResumeStartup } from './fresh-spawn-types'
import type { ConnectPanePtySession } from './connect-pane-pty-session'
import type { PtyPaneStartup } from '../pty-connection-types'

/** Starts the failure watch when this launch resumed a recorded Claude conversation. */
export function watchClaudeResumeFromStartup(
  session: ConnectPanePtySession,
  ptyId: string,
  startup: ColdRestoreAgentResumeStartup | PtyPaneStartup | null | undefined
): void {
  const agent = startup && ('agent' in startup ? startup.agent : startup.launchAgent)
  if (!startup || agent !== 'claude' || !startup.resumeProviderSession) {
    return
  }
  // Why dropped: a launch token is spent by the launch that carried it.
  const { ORCA_AGENT_LAUNCH_TOKEN: _spent, ...env } = startup.env ?? {}
  watchClaudeResumeStart({
    tabId: session.deps.tabId,
    leafId: session.pane.leafId,
    ptyId,
    startup: {
      command: startup.command,
      startupCommandDelivery: 'shell-ready',
      launchAgent: 'claude',
      env,
      ...(startup.launchConfig ? { launchConfig: startup.launchConfig } : {}),
      resumeProviderSession: startup.resumeProviderSession
    }
  })
}
