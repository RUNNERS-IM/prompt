import { promptClaudeSessionCopyCommand } from '../../../../shared/prompt-windows'

/**
 * Dropping a Prompt sidebar session row on another workspace. A Claude session row starts a copy
 * of the conversation in the target workspace's folder (claude --resume <id> --fork-session), and
 * the original tab keeps running. Everything else cancels:
 * - a plain terminal row: moving a live shell between workspaces is not supported, because main
 *   names each terminal after the workspace it was started in and stops it with that workspace;
 * - a remote workspace on either side: the conversation file lives on this machine;
 * - a tab with no Claude conversation, or with more than one (split panes), since it is unclear which to copy.
 */

/** DOM attribute on a workspace's session rows naming that workspace; the drop target lookup reads it. */
export const PROMPT_SESSION_DROP_WORKTREE_ATTR = 'data-prompt-session-drop-worktree'

/** Set on the target workspace's rows while a drop there would start a copy. */
export const PROMPT_SESSION_DROP_TARGET_ATTR = 'data-prompt-session-drop-target'

export type PromptSessionDropCancelReason =
  | 'no-target'
  | 'remote'
  | 'shell'
  | 'no-claude-session'
  | 'several-claude-sessions'

export type PromptSessionDropPlan =
  /** Same workspace: the existing reorder handles it. */
  | { kind: 'reorder' }
  | { kind: 'fork'; targetWorktreeId: string; command: string }
  | { kind: 'cancel'; reason: PromptSessionDropCancelReason }

/** One pane of the dragged tab that may hold a conversation. */
export type PromptSessionDropPane = {
  agentType: string
  /** The pane's live provider session id (resolvePaneAgentSessionId), or null. */
  sessionId: string | null
}

export function planPromptSessionDrop(args: {
  sourceWorktreeId: string
  targetWorktreeId: string | null
  sourceIsLocal: boolean
  targetIsLocal: boolean
  /** Panes of the dragged tab; null for a plain terminal row. */
  panes: readonly PromptSessionDropPane[] | null
}): PromptSessionDropPlan {
  const { sourceWorktreeId, targetWorktreeId } = args
  if (!targetWorktreeId) {
    return { kind: 'cancel', reason: 'no-target' }
  }
  if (targetWorktreeId === sourceWorktreeId) {
    return { kind: 'reorder' }
  }
  if (!args.sourceIsLocal || !args.targetIsLocal) {
    return { kind: 'cancel', reason: 'remote' }
  }
  if (!args.panes) {
    return { kind: 'cancel', reason: 'shell' }
  }
  const commands = new Set<string>()
  for (const pane of args.panes) {
    if (pane.agentType !== 'claude' || !pane.sessionId) {
      continue
    }
    const command = promptClaudeSessionCopyCommand(pane.sessionId)
    if (command) {
      commands.add(command)
    }
  }
  if (commands.size === 0) {
    return { kind: 'cancel', reason: 'no-claude-session' }
  }
  if (commands.size > 1) {
    return { kind: 'cancel', reason: 'several-claude-sessions' }
  }
  return { kind: 'fork', targetWorktreeId, command: [...commands][0]! }
}

/** The workspace whose session rows contain `element` (the element under the pointer), or null. */
export function promptSessionDropElementOf(element: Element | null): HTMLElement | null {
  return element?.closest<HTMLElement>(`[${PROMPT_SESSION_DROP_WORKTREE_ATTR}]`) ?? null
}

export function promptSessionDropWorktreeIdOf(element: Element | null): string | null {
  return (
    promptSessionDropElementOf(element)?.getAttribute(PROMPT_SESSION_DROP_WORKTREE_ATTR) || null
  )
}
