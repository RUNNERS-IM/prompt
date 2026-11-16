import type { AppState } from '@/store'
import { isClaudePaneMidTurn } from '@/lib/claude-session-account-move'
import { isHeldAtUsageLimitPicker } from '@/lib/claude-usage-limit-sessions'
import { makePaneKey } from '../../../../shared/stable-pane-id'

/** Why the picker: Claude waiting on its usage-limit choice still reads as mid-turn, yet only a restart moves it on. */
function isClaudeRestartReady(
  state: AppState,
  tabId: string,
  leafId: string,
  ptyId: string
): boolean {
  return !isClaudePaneMidTurn(state, makePaneKey(tabId, leafId)) || isHeldAtUsageLimitPicker(ptyId)
}

/** PTYs whose queued account restart can run now: Codex at once, this tab's Claude once its turn ends. */
export function selectReadyAccountRestartPtyIds(state: AppState, tabId: string): string[] {
  const pending = state.pendingPaneAccountRestarts
  const ready = Object.keys(pending).filter((ptyId) => pending[ptyId] === 'codex')
  const ptyIdsByLeafId = state.terminalLayoutsByTabId[tabId]?.ptyIdsByLeafId ?? {}
  for (const [leafId, ptyId] of Object.entries(ptyIdsByLeafId)) {
    if (pending[ptyId] === 'claude' && isClaudeRestartReady(state, tabId, leafId, ptyId)) {
      ready.push(ptyId)
    }
  }
  return ready
}

/** Whether `ptyId`'s queued restart can run against the store as it is now. */
export function isAccountRestartReady(
  state: AppState,
  tabId: string,
  leafId: string,
  ptyId: string
): boolean {
  const queued = state.pendingPaneAccountRestarts[ptyId]
  return (
    queued === 'codex' || (queued === 'claude' && isClaudeRestartReady(state, tabId, leafId, ptyId))
  )
}
