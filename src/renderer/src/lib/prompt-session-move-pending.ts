import { useSyncExternalStore } from 'react'

/** A move that has started but not yet closed the original tab, so it can still be cancelled. */
export type PromptPendingSessionMove = {
  /** Project the session is going to, as the sidebar names it. */
  targetLabel: string
  cancel: () => void
}

const pendingBySourceTabId = new Map<string, PromptPendingSessionMove>()
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function registerPromptPendingSessionMove(
  sourceTabId: string,
  move: PromptPendingSessionMove
): () => void {
  pendingBySourceTabId.set(sourceTabId, move)
  notify()
  return () => {
    if (pendingBySourceTabId.get(sourceTabId) === move) {
      pendingBySourceTabId.delete(sourceTabId)
      notify()
    }
  }
}

export function promptPendingSessionMoveOf(sourceTabId: string): PromptPendingSessionMove | null {
  return pendingBySourceTabId.get(sourceTabId) ?? null
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The pending move of a sidebar session row, re-rendering when one starts or ends. */
export function usePromptPendingSessionMove(sourceTabId: string): PromptPendingSessionMove | null {
  const snapshot = (): PromptPendingSessionMove | null => promptPendingSessionMoveOf(sourceTabId)
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
