import { useAppStore } from '@/store'
import { makePaneKey } from '../../../shared/stable-pane-id'
import type { CodexAccountSelectionTarget } from '../../../shared/codex-selection-lane'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'
import { resolveClaudePaneFolder, type ClaudeHostFolders } from './claude-pane-account-folder'
import {
  findClaudeSwitchSessions,
  localClaudePanes,
  type ClaudeSessionMoveCandidate
} from './claude-session-account-move'

// Why an id no pane holds: every pane on the login's folder then counts as on the outgoing side.
const LOGIN_FOLLOW_ACCOUNT_ID = '\u0000prompt-login-follow'

/** Running Claude sessions on the folder a `/login` pane just signed in to, without that pane. */
export async function findClaudeLoginFollowers(args: {
  loginPaneKey: string
  host?: ClaudeHostFolders
}): Promise<{ accountId: string | null; sessions: ClaudeSessionMoveCandidate[] } | null> {
  const owner: RuntimeClientTarget = { kind: 'local' }
  const target: CodexAccountSelectionTarget = { runtime: 'host' }
  const state = useAppStore.getState()
  const loginPane = [...localClaudePanes(state, owner, target)].find(
    (pane) => makePaneKey(pane.tabId, pane.leafId) === args.loginPaneKey
  )
  if (!loginPane?.inLane) {
    return null
  }
  const folder = resolveClaudePaneFolder(
    loginPane.transcriptPath,
    state.settings?.claudeManagedAccounts ?? [],
    args.host
  )
  // Why: a pane's own CLAUDE_CONFIG_DIR is a login no other pane shares.
  if (!folder || folder.kind === 'own-folder') {
    return null
  }
  const accountId = folder.kind === 'account' ? folder.accountId : null
  const found = await findClaudeSwitchSessions({
    owner,
    target,
    fromAccountId: accountId,
    toAccountId: LOGIN_FOLLOW_ACCOUNT_ID,
    host: args.host
  })
  return {
    accountId,
    sessions: found.onAccount.filter(
      (session) => makePaneKey(session.tabId, session.leafId) !== args.loginPaneKey
    )
  }
}
