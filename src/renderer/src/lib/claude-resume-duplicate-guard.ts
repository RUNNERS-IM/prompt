import type { AppState } from '@/store'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import { normalizeAgentProviderSession } from '../../../shared/agent-session-resume'

// Why a minute: a just-restarted pane loses its old status and its new Claude reports the
// conversation only after it starts, so for a while the status table alone would not show it.
const RECENT_LAUNCH_MS = 60_000

const recentLaunches = new Map<string, { paneKey: string; at: number }>()

/** Remember that this pane is about to resume the conversation. */
export function noteClaudeResumeLaunch(sessionId: string, paneKey: string, now = Date.now()): void {
  recentLaunches.set(sessionId, { paneKey, at: now })
}

/**
 * Whether another live pane already runs (or was just given) this Claude conversation.
 * Why: two `claude --resume <id>` processes on one conversation both write to it; an account
 * switch on 2026-11-24 brought 14 sessions back twice this way. A pane that is itself waiting for
 * its account restart does not count, so the first of two such panes still moves.
 */
export function isClaudeSessionRunningElsewhere(
  state: Pick<
    AppState,
    'agentStatusByPaneKey' | 'terminalLayoutsByTabId' | 'pendingPaneAccountRestarts'
  >,
  sessionId: string,
  paneKey: string,
  now = Date.now()
): boolean {
  const recent = recentLaunches.get(sessionId)
  if (recent && recent.paneKey !== paneKey && now - recent.at < RECENT_LAUNCH_MS) {
    return true
  }
  for (const [otherKey, entry] of Object.entries(state.agentStatusByPaneKey)) {
    if (otherKey === paneKey || entry?.agentType !== 'claude') {
      continue
    }
    if (normalizeAgentProviderSession(entry.providerSession)?.id !== sessionId) {
      continue
    }
    const pane = parsePaneKey(otherKey)
    const ptyId = pane
      ? state.terminalLayoutsByTabId[pane.tabId]?.ptyIdsByLeafId?.[pane.leafId]
      : undefined
    // A status row without a bound terminal is a closed pane's leftover.
    if (!ptyId || state.pendingPaneAccountRestarts[ptyId]) {
      continue
    }
    return true
  }
  return false
}

export function resetClaudeResumeDuplicateGuardForTests(): void {
  recentLaunches.clear()
}
