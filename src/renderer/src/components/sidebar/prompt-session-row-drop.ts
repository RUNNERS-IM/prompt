import { promptClaudeSessionCopyCommand } from '../../../../shared/prompt-windows'

/**
 * Dropping a Prompt sidebar session row on another workspace. A Claude session row starts a copy
 * of the conversation in the target workspace's folder (claude --resume <id> --fork-session), and
 * the original tab keeps running. A plain terminal row moves its tab, shell and all, to the target
 * (moveShellTabToWorkspace, which still refuses a shell with a program running). Everything else cancels:
 * - a remote workspace on either side: the conversation file and the shell live on this machine;
 * - a tab with no Claude conversation, or with more than one (split panes), since it is unclear which to copy.
 */

/** DOM attribute on a workspace's session rows naming that workspace; the drop target lookup reads it. */
export const PROMPT_SESSION_DROP_WORKTREE_ATTR = 'data-prompt-session-drop-worktree'

/** Set on the target workspace's rows while a drop there would start a copy. */
export const PROMPT_SESSION_DROP_TARGET_ATTR = 'data-prompt-session-drop-target'

/** Look of a lit drop target (workspace rows or a project header) while a drop there would land. */
export const PROMPT_SESSION_DROP_TARGET_CLASS =
  'data-[prompt-session-drop-target=true]:bg-worktree-sidebar-accent/60 data-[prompt-session-drop-target=true]:ring-1 data-[prompt-session-drop-target=true]:ring-inset data-[prompt-session-drop-target=true]:ring-worktree-sidebar-ring/60'

/** Text shown on the lit target saying what a drop does now ("Move here · ⌥ copies"). */
export const PROMPT_SESSION_DROP_HINT_ATTR = 'data-prompt-session-drop-hint'

export type PromptSessionDropCancelReason =
  | 'no-target'
  | 'remote'
  | 'no-claude-session'
  | 'several-claude-sessions'

export type PromptSessionDropPlan =
  /** Same workspace: the existing reorder handles it. */
  | { kind: 'reorder' }
  | { kind: 'fork'; targetWorktreeId: string; command: string }
  /** A plain terminal row: move the tab and its running shell to the target. */
  | { kind: 'move-shell'; targetWorktreeId: string }
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
    return { kind: 'move-shell', targetWorktreeId }
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

/**
 * DOM attribute on a project header naming its project. A row dropped on the header (collapsed,
 * empty or not) lands in that project's main workspace, so a drop never needs visible rows.
 */
export const PROMPT_SESSION_DROP_REPO_ATTR = 'data-prompt-session-drop-repo'

/** The drop target under `element`: a workspace's session rows or a project header, or null. */
export function promptSessionDropElementOf(element: Element | null): HTMLElement | null {
  return (
    element?.closest<HTMLElement>(
      `[${PROMPT_SESSION_DROP_WORKTREE_ATTR}], [${PROMPT_SESSION_DROP_REPO_ATTR}]`
    ) ?? null
  )
}

/**
 * The workspace a drop on `element` lands in. A project header names a project; `mainWorktreeOf`
 * turns it into that project's main workspace.
 */
export function promptSessionDropWorktreeIdOf(
  element: Element | null,
  mainWorktreeOf: (repoId: string) => string | null = () => null
): string | null {
  const target = promptSessionDropElementOf(element)
  if (!target) {
    return null
  }
  const worktreeId = target.getAttribute(PROMPT_SESSION_DROP_WORKTREE_ATTR)
  if (worktreeId) {
    return worktreeId
  }
  const repoId = target.getAttribute(PROMPT_SESSION_DROP_REPO_ATTR)
  return repoId ? mainWorktreeOf(repoId) : null
}
