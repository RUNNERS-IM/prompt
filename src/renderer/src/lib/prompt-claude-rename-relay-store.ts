import type { RuntimeTerminalAgentStatus, RuntimeTerminalRead } from '../../../shared/runtime-types'
import { useAppStore } from '@/store'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/runtime-client-target'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from '@/lib/worktree-runtime-owner'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import { findActiveRuntimeTerminal } from './active-agent-note-target'
import { sendPromptWithGuardedPasteAndEnter } from './active-agent-note-send-delivery'
import { ACTIVE_AGENT_SEND_RPC_TIMEOUT_MS } from './active-agent-terminal-send-readiness'
import type { AgentPaneConversation } from './ai-vault-tab-title-requests'
import {
  isClaudeInputBoxEmpty,
  startPromptClaudeRenameRelay,
  type PromptClaudeRenameDelivery
} from './prompt-claude-rename-relay'

const SCREEN_LINES = 12

async function typeClaudeRename(
  conversation: AgentPaneConversation<'claude'>,
  title: string
): Promise<PromptClaudeRenameDelivery> {
  const leafId = parsePaneKey(conversation.paneKey)?.leafId
  if (!leafId) {
    return 'gone'
  }
  const runtimeTarget = runtimeTargetForOwnerEnvironment(
    runtimeEnvironmentIdOrLocalUnlessTwin(useAppStore.getState(), conversation.worktreeId)
  )
  const terminal = await findActiveRuntimeTerminal(
    runtimeTarget,
    conversation.worktreeId,
    { tabId: conversation.tabId, leafId },
    ACTIVE_AGENT_SEND_RPC_TIMEOUT_MS
  )
  if (!terminal) {
    return 'gone'
  }
  const { agentStatus } = await callRuntimeRpc<{ agentStatus: RuntimeTerminalAgentStatus }>(
    runtimeTarget,
    'terminal.agentStatus',
    { terminal: terminal.handle },
    { timeoutMs: ACTIVE_AGENT_SEND_RPC_TIMEOUT_MS }
  )
  if (!agentStatus.isRunningAgent || agentStatus.status !== 'idle') {
    return 'retry'
  }
  const { terminal: screen } = await callRuntimeRpc<{ terminal: RuntimeTerminalRead }>(
    runtimeTarget,
    'terminal.read',
    { terminal: terminal.handle, screen: true, limit: SCREEN_LINES },
    { timeoutMs: ACTIVE_AGENT_SEND_RPC_TIMEOUT_MS }
  )
  // Enter would submit whatever the user was still writing together with the command.
  if (!isClaudeInputBoxEmpty(screen.tail)) {
    return 'retry'
  }
  const sent = await sendPromptWithGuardedPasteAndEnter(
    runtimeTarget,
    terminal.handle,
    `/rename ${title.replace(/\s+/g, ' ').trim()}`,
    { allowLegacyFallback: false }
  )
  return sent.status === 'sent' ? 'sent' : 'retry'
}

export function startPromptClaudeRenameRelayToStore(): () => void {
  return startPromptClaudeRenameRelay({
    getState: useAppStore.getState,
    subscribe: (listener) => useAppStore.subscribe(listener),
    deliver: typeClaudeRename
  })
}
