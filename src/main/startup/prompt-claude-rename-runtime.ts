import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import { agentHookServer } from '../agent-hooks/server'
import {
  createPromptClaudeRenameWatch,
  type PromptClaudeRenameTarget
} from '../agent-hooks/prompt-claude-rename-watch'
import { PROMPT_CLAUDE_SESSION_TITLE_CHANNEL } from '../../shared/prompt-claude-session-title'
import {
  PROMPT_CLAUDE_ACCOUNT_SWITCHED_CHANNEL,
  PROMPT_CLAUDE_LOGIN_CHANNEL,
  PROMPT_CLAUDE_RESTART_REPLY_CHANNEL,
  PROMPT_CLAUDE_RESTART_REQUEST_CHANNEL,
  type PromptClaudeRestartRequest,
  type PromptClaudeRestartResult
} from '../../shared/prompt-claude-login-sync'
import { onClaudeAccountSwitchedByCommand } from '../claude-accounts/claude-account-switch-events'
import { setClaudeSessionRestartHandler } from '../claude-accounts/claude-session-restart-requests'
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

// Reading each session's screen and queueing restarts takes a few seconds with many sessions open.
const RESTART_REPLY_TIMEOUT_MS = 60_000

type RestartReply = { requestId: string; result?: PromptClaudeRestartResult; error?: string }

function requestRestartFromWindow(
  request: PromptClaudeRestartRequest
): Promise<PromptClaudeRestartResult> {
  const window = state.mainWindow
  if (!window || window.isDestroyed()) {
    return Promise.reject(new Error('Open the Prompt window first; it restarts the sessions.'))
  }
  const webContents = window.webContents
  const requestId = randomUUID()
  return new Promise((resolve, reject) => {
    const finish = (): void => {
      clearTimeout(timeout)
      ipcMain.removeListener(PROMPT_CLAUDE_RESTART_REPLY_CHANNEL, onReply)
    }
    const onReply = (event: Electron.IpcMainEvent, reply: RestartReply): void => {
      // Only the window asked may answer.
      if (event.sender !== webContents || reply.requestId !== requestId) {
        return
      }
      finish()
      if (reply.result) {
        resolve(reply.result)
      } else {
        reject(new Error(reply.error ?? 'The window could not restart the sessions.'))
      }
    }
    const timeout = setTimeout(() => {
      finish()
      reject(new Error('The Prompt window did not answer the restart request.'))
    }, RESTART_REPLY_TIMEOUT_MS)
    ipcMain.on(PROMPT_CLAUDE_RESTART_REPLY_CHANNEL, onReply)
    webContents.send(PROMPT_CLAUDE_RESTART_REQUEST_CHANNEL, { ...request, requestId })
  })
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
  setClaudeSessionRestartHandler(requestRestartFromWindow)
  // Provider-session changes cover new sessions, pane teardown and dropped rows alike.
  agentHookServer.subscribeProviderSessionChanges(() => watch.reconcile())
  agentHookServer.subscribePaneStatusClear(() => watch.reconcile())
  watch.reconcile()
}
