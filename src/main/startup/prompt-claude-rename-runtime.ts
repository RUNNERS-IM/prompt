import { agentHookServer } from '../agent-hooks/server'
import {
  createPromptClaudeRenameWatch,
  type PromptClaudeRenameTarget
} from '../agent-hooks/prompt-claude-rename-watch'
import { PROMPT_CLAUDE_SESSION_TITLE_CHANNEL } from '../../shared/prompt-claude-session-title'
import {
  PROMPT_CLAUDE_ACCOUNT_SWITCHED_CHANNEL,
  PROMPT_CLAUDE_LOGIN_CHANNEL
} from '../../shared/prompt-claude-login-sync'
import { onClaudeAccountSwitchedByCommand } from '../claude-accounts/claude-account-switch-events'
import { mainProcessState as state } from './main-process-state'

/** Local Claude rows with a hook-reported transcript; remote transcripts are not on this disk. */
function liveClaudeTargets(): PromptClaudeRenameTarget[] {
  const targets: PromptClaudeRenameTarget[] = []
  for (const row of agentHookServer.getStatusSnapshot()) {
    const transcriptPath = row.providerSession?.transcriptPath
    if (row.agentType !== 'claude' || row.connectionId || !row.providerSession?.id) {
      continue
    }
    if (transcriptPath?.endsWith('.jsonl')) {
      targets.push({ paneKey: row.paneKey, sessionId: row.providerSession.id, transcriptPath })
    }
  }
  return targets
}

let installed = false

/** Retitle a Claude tab on `/rename` and report `/login` within a poll; once per process. */
export function installPromptClaudeRenameRuntime(): void {
  if (installed) {
    return
  }
  installed = true
  const send = (channel: string, event: unknown): void => {
    const window = state.mainWindow
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, event)
    }
  }
  const watch = createPromptClaudeRenameWatch({
    listTargets: liveClaudeTargets,
    onTitle: (event) => send(PROMPT_CLAUDE_SESSION_TITLE_CHANNEL, event),
    onLogin: (event) => send(PROMPT_CLAUDE_LOGIN_CHANNEL, event)
  })
  onClaudeAccountSwitchedByCommand((event) => send(PROMPT_CLAUDE_ACCOUNT_SWITCHED_CHANNEL, event))
  // Provider-session changes cover new sessions, pane teardown and dropped rows alike.
  agentHookServer.subscribeProviderSessionChanges(() => watch.reconcile())
  agentHookServer.subscribePaneStatusClear(() => watch.reconcile())
  watch.reconcile()
}
