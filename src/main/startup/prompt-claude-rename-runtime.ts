import { agentHookServer } from '../agent-hooks/server'
import {
  createPromptClaudeRenameWatch,
  type PromptClaudeRenameTarget
} from '../agent-hooks/prompt-claude-rename-watch'
import { PROMPT_CLAUDE_SESSION_TITLE_CHANNEL } from '../../shared/prompt-claude-session-title'
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

/** Retitle a Claude tab within a poll of `/rename` instead of on its next turn; once per process. */
export function installPromptClaudeRenameRuntime(): void {
  if (installed) {
    return
  }
  installed = true
  const watch = createPromptClaudeRenameWatch({
    listTargets: liveClaudeTargets,
    onTitle: (event) => {
      const window = state.mainWindow
      if (window && !window.isDestroyed()) {
        window.webContents.send(PROMPT_CLAUDE_SESSION_TITLE_CHANNEL, event)
      }
    }
  })
  // Provider-session changes cover new sessions, pane teardown and dropped rows alike.
  agentHookServer.subscribeProviderSessionChanges(() => watch.reconcile())
  agentHookServer.subscribePaneStatusClear(() => watch.reconcile())
  watch.reconcile()
}
