import type { AgentType } from '../../../shared/agent-status-types'
import { terminalTabSetName } from '../../../shared/tab-title-resolution'
import type { AppState } from '@/store/types'
import {
  collectAgentPaneConversations,
  type AgentPaneConversation
} from './ai-vault-tab-title-requests'

export type PromptClaudeRenameDelivery = 'sent' | 'retry' | 'gone'

export type PromptClaudeRenameRelayDeps = {
  getState: () => AppState
  subscribe: (listener: () => void) => () => void
  deliver: (
    conversation: AgentPaneConversation<'claude'>,
    title: string
  ) => Promise<PromptClaudeRenameDelivery>
  retryMs?: number
}

const RETRY_MS = 10_000
// A draft left in the box stops the timer; the next finished turn tries again.
const MAX_TIMER_RETRIES = 30

function isClaudeAgent(agent: AgentType | null | undefined): agent is 'claude' {
  return agent === 'claude'
}

function runningClaudeOfTab(
  state: AppState,
  tabId: string
): AgentPaneConversation<'claude'> | undefined {
  return collectAgentPaneConversations(state, isClaudeAgent, { runningAgentsOnly: true }).find(
    (conversation) => conversation.tabId === tabId
  )
}

/**
 * Claude keeps its own session name, which Prompt cannot edit, so a name set from the session list,
 * tab menu or `prompt session rename` is typed as `/rename` once that Claude has finished its turn.
 */
export function startPromptClaudeRenameRelay(deps: PromptClaudeRenameRelayDeps): () => void {
  const pending = new Map<string, string>()
  const knownNames = new Map<string, string>()
  let lastTabs: AppState['tabsByWorktree'] | null = null
  let lastStatuses: AppState['agentStatusByPaneKey'] | null = null
  let draining = false
  let drainAgain = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let timerRetries = 0
  let stopped = false

  const noteRenames = (state: AppState): void => {
    const seen = new Set<string>()
    for (const tab of Object.values(state.tabsByWorktree).flat()) {
      seen.add(tab.id)
      const name = terminalTabSetName(tab)
      const previous = knownNames.get(tab.id)
      knownNames.set(tab.id, name)
      if (previous === undefined || previous === name) {
        continue
      }
      if (!name) {
        pending.delete(tab.id)
      } else if (runningClaudeOfTab(state, tab.id) && tab.aiVaultTitle?.title.trim() !== name) {
        pending.set(tab.id, name)
      }
    }
    for (const tabId of knownNames.keys()) {
      if (!seen.has(tabId)) {
        knownNames.delete(tabId)
        pending.delete(tabId)
      }
    }
  }

  const armTimer = (): void => {
    if (timer !== null || stopped || timerRetries >= MAX_TIMER_RETRIES) {
      return
    }
    timerRetries += 1
    timer = setTimeout(() => {
      timer = null
      void drain()
    }, deps.retryMs ?? RETRY_MS)
  }

  const drain = async (): Promise<void> => {
    if (draining) {
      drainAgain = true
      return
    }
    draining = true
    let wantsRetry = false
    for (const [tabId, title] of pending) {
      const state = deps.getState()
      const conversation = runningClaudeOfTab(state, tabId)
      if (!conversation) {
        pending.delete(tabId)
        continue
      }
      if (state.agentStatusByPaneKey[conversation.paneKey]?.state !== 'done') {
        continue
      }
      const delivery = await deps.deliver(conversation, title).catch(() => 'retry' as const)
      // The name may have changed while this one was on its way; that newer one stays queued.
      if (delivery !== 'retry' && pending.get(tabId) === title) {
        pending.delete(tabId)
      }
      wantsRetry ||= delivery === 'retry'
    }
    draining = false
    if (drainAgain) {
      drainAgain = false
      void drain()
    } else if (wantsRetry) {
      armTimer()
    }
  }

  const onStoreChange = (): void => {
    const state = deps.getState()
    const renamedTabsMayDiffer = state.tabsByWorktree !== lastTabs
    const statusesChanged = state.agentStatusByPaneKey !== lastStatuses
    lastTabs = state.tabsByWorktree
    lastStatuses = state.agentStatusByPaneKey
    if (renamedTabsMayDiffer) {
      noteRenames(state)
    }
    if (pending.size > 0 && (renamedTabsMayDiffer || statusesChanged)) {
      timerRetries = 0
      void drain()
    }
  }

  onStoreChange()
  const unsubscribe = deps.subscribe(onStoreChange)
  return () => {
    stopped = true
    unsubscribe()
    if (timer !== null) {
      clearTimeout(timer)
    }
  }
}

/** Whether Claude's input box, as shown on screen, has nothing the user has typed into it. */
export function isClaudeInputBoxEmpty(screenLines: readonly string[]): boolean {
  for (let index = screenLines.length - 1; index > 0; index -= 1) {
    const line = screenLines[index]!.trim()
    if (!line.startsWith('❯')) {
      continue
    }
    const isBox =
      screenLines[index - 1]!.trim().startsWith('─') &&
      screenLines[index + 1]?.trim().startsWith('─') === true
    return isBox && line.slice(1).trim().length === 0
  }
  return false
}
