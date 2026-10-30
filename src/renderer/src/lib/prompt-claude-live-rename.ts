import { useEffect } from 'react'
import type {
  PromptClaudeSessionTitleApi,
  PromptClaudeSessionTitleEvent
} from '../../../shared/prompt-claude-session-title'
import type { AppState } from '@/store/types'
import { useAppStore } from '@/store'
import { isAiVaultTitleAgent } from '../../../shared/ai-vault-session-title'
import { collectAgentPaneConversations } from './ai-vault-tab-title-requests'

/**
 * Store a `/rename` as the tab's AI vault title, the slot the tab strip, sidebar row, saved session
 * and mobile already read. Only the conversation the vault sync tracks for that tab is written, so
 * its next scan agrees instead of clearing it.
 *
 * The watch reports only records appended while it reads, so a new title here is a `/rename` made
 * now, after any name set on the tab (`terminal create --title`, the tab menu). That set name is
 * cleared so the `/rename` shows and stays after a restart; a tab rename made later sets it again
 * and wins. A title equal to the stored one (Claude re-appends its record) leaves the set name alone.
 */
export function applyPromptClaudeSessionTitle(
  state: AppState,
  event: PromptClaudeSessionTitleEvent
): boolean {
  const title = event.title.trim()
  const conversation = collectAgentPaneConversations(state, isAiVaultTitleAgent).find(
    (candidate) => candidate.paneKey === event.paneKey
  )
  if (
    !title ||
    conversation?.agent !== 'claude' ||
    conversation.providerSession.id !== event.sessionId
  ) {
    return false
  }
  const tab = Object.values(state.tabsByWorktree)
    .flat()
    .find((candidate) => candidate.id === conversation.tabId)
  const stored = tab?.aiVaultTitle
  const isNewRename = stored?.sessionId !== event.sessionId || stored.title.trim() !== title
  if (isNewRename && tab?.customTitle?.trim()) {
    state.setTabCustomTitle(conversation.tabId, null, { recordInteraction: false })
  }
  state.setAiVaultTabTitle(conversation.tabId, {
    agent: 'claude',
    sessionId: event.sessionId,
    title
  })
  return true
}

export function startPromptClaudeLiveRename(deps: {
  api: PromptClaudeSessionTitleApi | undefined
  getState: () => AppState
}): () => void {
  // The web client has no main process to read transcripts; its fallback API may be absent.
  const unsubscribe = deps.api?.onTitle?.((event) => {
    applyPromptClaudeSessionTitle(deps.getState(), event)
  })
  return typeof unsubscribe === 'function' ? unsubscribe : () => {}
}

export function PromptClaudeLiveRenameGate(): null {
  useEffect(
    () =>
      startPromptClaudeLiveRename({
        api: window.api.promptClaudeSessionTitle,
        getState: useAppStore.getState
      }),
    []
  )
  return null
}
