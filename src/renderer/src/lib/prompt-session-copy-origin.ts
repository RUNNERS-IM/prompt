import { resolvePaneAgentSessionId } from '@/components/terminal-pane/pane-agent-session-id'

/**
 * Conversation each session copy was opened from (`claude --resume <id> --fork-session`), by tab.
 * A resumed copy reports no id of its own until its next message, and until then it holds exactly
 * the conversation it was copied from, so that id still moves or copies it correctly.
 */
const copyOriginByTabId = new Map<string, string>()

export function rememberPromptSessionCopyOrigin(tabId: string, sessionId: string): void {
  copyOriginByTabId.set(tabId, sessionId)
}

export function forgetPromptSessionCopyOriginsForTests(): void {
  copyOriginByTabId.clear()
}

/**
 * The conversation a pane would hand to a move or copy: its live id, or, for a copy that has not
 * reported one yet while Claude still runs in it, the conversation it was copied from.
 */
export function resolvePromptMovableSessionId(
  state: Parameters<typeof resolvePaneAgentSessionId>[0],
  paneKey: string
): string | null {
  const live = resolvePaneAgentSessionId(state, paneKey)
  if (live) {
    return live
  }
  const origin = copyOriginByTabId.get(paneKey.split(':')[0] ?? '')
  if (!origin) {
    return null
  }
  const entry = state.agentStatusByPaneKey[paneKey]
  const claudeRunsThere =
    entry?.agentType === 'claude' &&
    state.paneForegroundAgentByPaneKey[paneKey]?.shellForeground !== true
  return claudeRunsThere ? origin : null
}
