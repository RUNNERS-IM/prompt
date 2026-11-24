import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { makePaneKey } from '../../../shared/stable-pane-id'
import type { NotMovedSessions } from './claude-account-restart-toast'
import type {
  ClaudeSessionCantMoveReason,
  ClaudeSessionMoveCandidate,
  ClaudeSwitchSessions
} from './claude-session-account-move'

export function cantMoveReasonLabel(reason: ClaudeSessionCantMoveReason): string {
  switch (reason) {
    case 'wsl-terminal':
      return translate('accounts.claude.switchSessions.reasonWsl', 'WSL terminal')
    case 'own-folder':
      return translate(
        'accounts.claude.switchSessions.reasonOwnFolder',
        'Uses your own Claude folder'
      )
    case 'unknown-account':
      return translate('accounts.claude.switchSessions.reasonUnknownAccount', 'Account unknown')
    case 'no-session':
      return translate('accounts.claude.switchSessions.reasonNoSession', "Can't resume")
  }
}

/** The name a user knows the session by: its tab name, else its last prompt. */
export function claudeSwitchSessionName(
  state: Pick<AppState, 'tabsByWorktree' | 'agentStatusByPaneKey'>,
  session: ClaudeSessionMoveCandidate
): string {
  const tab = state.tabsByWorktree[session.worktreeId]?.find(
    (candidate) => candidate.id === session.tabId
  )
  return (
    tab?.customTitle?.trim() ||
    tab?.title?.trim() ||
    state.agentStatusByPaneKey[makePaneKey(session.tabId, session.leafId)]?.prompt?.trim() ||
    translate('accounts.claude.switchSessions.session', 'Claude session')
  )
}

/** What the restart toast says about sessions a switch left behind. */
export function notMovedSessions(
  cantMove: ClaudeSwitchSessions['cantMove'],
  moveAll: () => void
): NotMovedSessions {
  const state = useAppStore.getState()
  return {
    lines: cantMove.map(
      (session) =>
        `${claudeSwitchSessionName(state, session)} (${cantMoveReasonLabel(session.reason)})`
    ),
    ...(cantMove.some((session) => session.movable) ? { moveAll } : {})
  }
}
