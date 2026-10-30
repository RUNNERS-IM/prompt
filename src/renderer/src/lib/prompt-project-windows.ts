import { useEffect, useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'
import {
  PROMPT_PROJECT_WINDOW_QUERY,
  promptRepoIdOfWorktreeId,
  type PromptProjectWindowsState
} from '../../../shared/prompt-project-windows'

/** The project this window shows, read once from the URL; null in the main window. */
export const promptSelfRepoId: string | null = (() => {
  try {
    return new URLSearchParams(window.location.search).get(PROMPT_PROJECT_WINDOW_QUERY) || null
  } catch {
    return null
  }
})()

export const isPromptProjectWindow = promptSelfRepoId !== null

let openRepoIds: readonly string[] = []
const listeners = new Set<() => void>()
let subscribed = false

function setOpenRepoIds(next: readonly string[]): void {
  if (next.length === openRepoIds.length && next.every((id, i) => id === openRepoIds[i])) {
    return
  }
  openRepoIds = next
  listeners.forEach((listener) => listener())
}

function ensureSubscribed(): void {
  const api = window.api?.promptProjectWindows
  if (subscribed || !api) {
    return
  }
  subscribed = true
  api.onChanged((state: PromptProjectWindowsState) => setOpenRepoIds(state.openRepoIds))
  void api.getState().then((state) => setOpenRepoIds(state.openRepoIds))
}

function subscribe(listener: () => void): () => void {
  ensureSubscribed()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Projects that are open in their own windows (empty when none). */
export function usePromptOpenProjectWindows(): readonly string[] {
  return useSyncExternalStore(
    subscribe,
    () => openRepoIds,
    () => openRepoIds
  )
}

/** True in the main window for a project that another window now shows. */
export function usePromptProjectShownElsewhere(repoId: string | undefined): boolean {
  const open = usePromptOpenProjectWindows()
  return !isPromptProjectWindow && !!repoId && open.includes(repoId)
}

export function openPromptProjectWindow(repoId: string): void {
  void window.api?.promptProjectWindows?.open(repoId)
}

export function focusPromptProjectWindow(repoId: string): void {
  void window.api?.promptProjectWindows?.focus(repoId)
}

function firstWorktreeIdOf(repoId: string): string | null {
  const worktrees = useAppStore.getState().worktreesByRepo?.[repoId] ?? []
  return (worktrees.find((w) => w.isMainWorktree) ?? worktrees[0])?.id ?? null
}

/**
 * Keeps each window on its own projects once the session has loaded:
 * a project window filters the sidebar to its project and shows one of its workspaces;
 * the main window leaves a workspace whose project another window has taken.
 */
export function usePromptProjectWindowScope(): void {
  const ready = useAppStore((s) => s.workspaceSessionReady)
  const open = usePromptOpenProjectWindows()
  const reposLoaded = useAppStore((s) =>
    promptSelfRepoId ? (s.worktreesByRepo?.[promptSelfRepoId]?.length ?? 0) > 0 : true
  )

  useEffect(() => {
    if (!ready || !promptSelfRepoId || !reposLoaded) {
      return
    }
    const state = useAppStore.getState()
    state.setFilterRepoIds([promptSelfRepoId])
    const active = state.activeWorktreeId
    if (!active || promptRepoIdOfWorktreeId(active) !== promptSelfRepoId) {
      const target = firstWorktreeIdOf(promptSelfRepoId)
      if (target) {
        state.setActiveWorktree(target)
      }
    }
  }, [ready, reposLoaded])

  useEffect(() => {
    if (!ready || isPromptProjectWindow) {
      return
    }
    const state = useAppStore.getState()
    const active = state.activeWorktreeId
    const activeRepo = active ? promptRepoIdOfWorktreeId(active) : null
    if (activeRepo && open.includes(activeRepo)) {
      state.setActiveWorktree(null)
    }
  }, [ready, open])
}
