import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/runtime-client-target'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from '@/lib/worktree-runtime-owner'
import { agentRetryableFailureKind } from '../../../shared/agent-main-agent-verdict'
import { claudeUsageLimitScreen } from '../../../shared/claude-usage-limit-screen'
import type {
  RuntimeTerminalAgentStatus,
  RuntimeTerminalRead,
  RuntimeTerminalSend
} from '../../../shared/runtime-types'
import { makePaneKey } from '../../../shared/stable-pane-id'
import { findActiveRuntimeTerminal } from './active-agent-note-target'
import { ORCA_DESKTOP_TERMINAL_CLIENT } from './active-agent-note-send-delivery'
import { ACTIVE_AGENT_SEND_RPC_TIMEOUT_MS } from './active-agent-terminal-send-readiness'
import { isClaudeInputBoxEmpty } from './prompt-claude-rename-relay'
import type { ClaudeSessionMoveCandidate } from './claude-session-account-move'

const SCREEN_LINES = 30
// 다시 연 Claude 가 대화를 불러와 입력칸을 띄울 때까지 기다리는 시간.
const CONTINUE_DEADLINE_MS = 3 * 60_000
const CONTINUE_POLL_MS = 2_000

/** 한도 고르기 창에 멈춘 세션. 이 창은 훅을 보내지 않아 상태가 '일하는 중'으로 남으므로, 다시 시작을 막지 않게 따로 적어 둔다. */
const heldAtLimitPicker = new Set<string>()
/** 다시 시작한 뒤 이어서 하라고 보낼 글, 옛 ptyId 별. */
const continueAfterRestart = new Map<string, string>()

/** Hook verdict only; use findClaudeSessionsStoppedAtUsageLimit for the screen check too. */
export function isStoppedAtUsageLimit(candidate: ClaudeSessionMoveCandidate): boolean {
  const row =
    useAppStore.getState().agentStatusByPaneKey[makePaneKey(candidate.tabId, candidate.leafId)]
  return row ? agentRetryableFailureKind(row) === 'usage-limit' : false
}

export function isHeldAtUsageLimitPicker(ptyId: string): boolean {
  return heldAtLimitPicker.has(ptyId)
}

async function readPaneScreen(candidate: ClaudeSessionMoveCandidate): Promise<string[] | null> {
  const runtimeTarget = runtimeTargetForOwnerEnvironment(
    runtimeEnvironmentIdOrLocalUnlessTwin(useAppStore.getState(), candidate.worktreeId)
  )
  const terminal = await findActiveRuntimeTerminal(
    runtimeTarget,
    candidate.worktreeId,
    { tabId: candidate.tabId, leafId: candidate.leafId },
    ACTIVE_AGENT_SEND_RPC_TIMEOUT_MS
  )
  if (!terminal) {
    return null
  }
  const { terminal: screen } = await callRuntimeRpc<{ terminal: RuntimeTerminalRead }>(
    runtimeTarget,
    'terminal.read',
    { terminal: terminal.handle, screen: true, limit: SCREEN_LINES },
    { timeoutMs: ACTIVE_AGENT_SEND_RPC_TIMEOUT_MS }
  )
  return screen.tail
}

/**
 * 한도로 멈춘 세션: 훅이 한도 실패로 알린 것, 그리고 화면 아래에 한도 문장이나 한도 고르기 창이 있는 것.
 * Why the screen: 고르기 창(「What do you want to do?」)에 멈춘 Claude 는 실패 훅을 보내지 않는다.
 */
export async function findClaudeSessionsStoppedAtUsageLimit<T extends ClaudeSessionMoveCandidate>(
  candidates: readonly T[]
): Promise<T[]> {
  const check = async (candidate: T): Promise<boolean> => {
    if (isStoppedAtUsageLimit(candidate)) {
      return true
    }
    const lines = await readPaneScreen(candidate)
    const seen = lines ? claudeUsageLimitScreen(lines) : null
    if (seen === 'picker') {
      heldAtLimitPicker.add(candidate.ptyId)
    }
    return seen !== null
  }
  // Why false on error: a pane that can't be read still restarts with the rest, just without the continue line.
  const checked = await Promise.all(
    candidates.map((candidate) => check(candidate).catch(() => false))
  )
  return candidates.filter((_, index) => checked[index])
}

/** 다시 시작이 끝나면 이어서 하라는 글을 보낼 세션으로 적는다. */
export function markContinueAfterRestart(ptyIds: readonly string[], line?: string): void {
  const text = line ?? claudeContinueLine()
  for (const ptyId of ptyIds) {
    continueAfterRestart.set(ptyId, text)
  }
}

export function claudeContinueLine(): string {
  return translate(
    'accounts.claude.switchSessions.continuePrompt',
    'The Claude account has changed. Please continue the work you were doing.'
  )
}

/** The continue line queued for `ptyId`'s restart, taken once; also forgets its picker hold. */
export function takeContinueAfterRestart(ptyId: string): string | null {
  heldAtLimitPicker.delete(ptyId)
  const text = continueAfterRestart.get(ptyId) ?? null
  continueAfterRestart.delete(ptyId)
  return text
}

type ContinueDelivery = 'sent' | 'retry' | 'gone'

async function typeContinue(
  pane: Omit<ClaudeSessionMoveCandidate, 'ptyId'>,
  text: string
): Promise<ContinueDelivery> {
  const runtimeTarget = runtimeTargetForOwnerEnvironment(
    runtimeEnvironmentIdOrLocalUnlessTwin(useAppStore.getState(), pane.worktreeId)
  )
  const terminal = await findActiveRuntimeTerminal(
    runtimeTarget,
    pane.worktreeId,
    { tabId: pane.tabId, leafId: pane.leafId },
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
  // Enter would submit whatever the user was still writing together with this line.
  if (!isClaudeInputBoxEmpty(screen.tail)) {
    return 'retry'
  }
  const { send } = await callRuntimeRpc<{ send: RuntimeTerminalSend }>(
    runtimeTarget,
    'terminal.send',
    {
      terminal: terminal.handle,
      text,
      enter: true,
      agentPrompt: true,
      client: ORCA_DESKTOP_TERMINAL_CLIENT
    },
    { timeoutMs: ACTIVE_AGENT_SEND_RPC_TIMEOUT_MS }
  )
  return send.accepted ? 'sent' : 'retry'
}

/** 다시 연 Claude 가 입력을 받을 수 있게 되면 이어서 하라는 글을 한 번 보낸다. 시간 안에 못 보내면 그만둔다. */
export async function sendContinueWhenReady(
  pane: Omit<ClaudeSessionMoveCandidate, 'ptyId'>,
  text: string
): Promise<boolean> {
  const deadline = Date.now() + CONTINUE_DEADLINE_MS
  while (Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, CONTINUE_POLL_MS))
    const delivery = await typeContinue(pane, text).catch(() => 'retry' as const)
    if (delivery !== 'retry') {
      return delivery === 'sent'
    }
  }
  return false
}

export function resetClaudeUsageLimitSessionsForTests(): void {
  heldAtLimitPicker.clear()
  continueAfterRestart.clear()
}
