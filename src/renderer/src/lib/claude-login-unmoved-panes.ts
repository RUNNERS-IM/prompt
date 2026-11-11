import type { ClaudeSessionMoveCandidate } from './claude-session-account-move'

let unmoved: readonly ClaudeSessionMoveCandidate[] = []
const listeners = new Set<() => void>()

function publish(next: readonly ClaudeSessionMoveCandidate[]): void {
  unmoved = next
  for (const listener of listeners) {
    listener()
  }
}

export function getClaudeLoginUnmovedPanes(): readonly ClaudeSessionMoveCandidate[] {
  return unmoved
}

export function subscribeClaudeLoginUnmovedPanes(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Replaces the list: each login or switch rescans every pane, so an older result is stale. */
export function setClaudeLoginUnmovedPanes(panes: readonly ClaudeSessionMoveCandidate[]): void {
  publish(panes)
}

export function clearClaudeLoginUnmovedPane(ptyId: string): void {
  publish(unmoved.filter((pane) => pane.ptyId !== ptyId))
}
