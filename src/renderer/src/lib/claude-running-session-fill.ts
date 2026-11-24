import { useAppStore } from '@/store'
import { resolveAgentPaneAuthorityKey } from '@/store/slices/agent-pane-authority'
import { normalizeAgentProviderSession } from '../../../shared/agent-session-resume'
import type { ClaudeRunningSessionEvidence } from '../../../shared/claude-running-session-evidence'

/**
 * Give each live Claude pane without hook evidence the session its running process reports.
 * Why: a pane whose hooks never reached this Prompt (started before it reopened, or on a folder
 * whose hooks point elsewhere) has no transcript path or resume id, so an account switch could
 * not tell its folder and left it behind, and `prompt session list` showed no RESUME ID.
 * Returns how many panes were filled.
 */
export function applyClaudeRunningSessions(
  evidence: readonly ClaudeRunningSessionEvidence[]
): number {
  const byPane = new Map(evidence.map((item) => [resolveAgentPaneAuthorityKey(item.paneKey), item]))
  let filled = 0
  if (byPane.size === 0) {
    return 0
  }
  useAppStore.getState().updateAgentStatusState((current, changedPaneKeys) => {
    let next = current.agentStatusByPaneKey
    for (const [paneKey, item] of byPane) {
      const entry = next[paneKey]
      if (entry?.agentType !== 'claude' || entry.structuredHostOwned) {
        continue
      }
      // Why only when missing: hook evidence is fresher and names the real transcript file.
      if (normalizeAgentProviderSession(entry.providerSession)?.transcriptPath) {
        continue
      }
      if (next === current.agentStatusByPaneKey) {
        next = { ...next }
      }
      next[paneKey] = {
        ...entry,
        providerSession: {
          key: 'session_id',
          id: item.sessionId,
          cwd: item.cwd,
          transcriptPath: item.transcriptPath
        }
      }
      changedPaneKeys.add(paneKey)
      filled += 1
    }
    return next === current.agentStatusByPaneKey ? current : { agentStatusByPaneKey: next }
  })
  return filled
}

/** Read the host's running Claude processes and fill panes that lack hook evidence. */
export async function fillClaudePaneSessionsFromProcesses(): Promise<number> {
  try {
    const probe = window.api?.claudeAccounts?.probeRunningSessions
    return probe ? applyClaudeRunningSessions(await probe()) : 0
  } catch {
    return 0
  }
}
