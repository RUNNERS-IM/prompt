import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { revealWorkspaceSurface } from '@/lib/workspace-surface-reveal'
import { focusTerminalInitiatedTab } from '@/hooks/ipc-events/terminal-command-state'
import { persistAgentLaunchTabOrder } from '@/lib/launch-agent-tab-order'
import {
  PROMPT_MAIN_WINDOW_KEY,
  PROMPT_OPEN_REPO_QUERY,
  PROMPT_WINDOW_QUERY,
  type PromptWindowSummary
} from '../../../shared/prompt-windows'

/**
 * Prompt windows in the renderer (see shared/prompt-windows.ts). Main hands each window only its
 * own tabs when it reads the session, so nothing here filters tabs; this file opens windows,
 * moves tabs and applies a window's first selection.
 */

function queryValue(name: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(name) || null
  } catch {
    return null
  }
}

/** This window's key, read once from the URL; "main" in the main window. */
export const promptSelfWindowKey: string = queryValue(PROMPT_WINDOW_QUERY) ?? PROMPT_MAIN_WINDOW_KEY

export const isPromptExtraWindow = promptSelfWindowKey !== PROMPT_MAIN_WINDOW_KEY

export function openPromptNewWindow(): void {
  void window.api?.promptWindows?.newWindow()
}

export function openPromptProjectWindow(repoId: string): void {
  void window.api?.promptWindows?.openProject(repoId)
}

export async function listPromptWindows(): Promise<PromptWindowSummary[]> {
  return (await window.api?.promptWindows?.list()) ?? []
}

/** Hands a tab to another window (`target`: a window key, or "new"). Its terminal keeps running. */
export function movePromptTabToWindow(tabId: string, target: string): void {
  void window.api?.promptWindows?.moveTab(tabId, target)
}

/** Copy of a Claude session in a new window (`command` from promptClaudeSessionCopyCommand). */
export function openPromptSessionCopyWindow(worktreeId: string, command: string): void {
  void window.api?.promptWindows?.openSessionCopy(worktreeId, command)
}

/** A new terminal tab in this window that runs `command` once its shell is ready. */
function startTabWithCommand(worktreeId: string, command: string): string {
  const store = useAppStore.getState()
  const tab = store.createTab(worktreeId, undefined, undefined, {
    pendingStartup: { command }
  })
  store.setActiveTabType('terminal', worktreeId)
  persistAgentLaunchTabOrder(worktreeId, tab.id)
  return tab.id
}

function mainWorktreeIdOf(repoId: string): string | null {
  const worktrees = useAppStore.getState().worktreesByRepo?.[repoId] ?? []
  return (worktrees.find((w) => w.isMainWorktree) ?? worktrees[0])?.id ?? null
}

function showTab(worktreeId: string, tabId: string | null): void {
  const store = useAppStore.getState()
  revealWorkspaceSurface(store, worktreeId)
  if (tabId) {
    store.setActiveTab(tabId)
    focusTerminalInitiatedTab(tabId, null, worktreeId)
  }
}

/** Forget the "open this project" request so a reload of this window does not repeat it. */
function dropOpenRepoQuery(): void {
  try {
    const url = new URL(window.location.href)
    url.searchParams.delete(PROMPT_OPEN_REPO_QUERY)
    window.history.replaceState(window.history.state, '', url.toString())
  } catch {
    // Keeping the query only means a reload selects the project again.
  }
}

/**
 * Once the session has loaded: a window opened for a project selects that project's main
 * workspace; a window that just received tabs selects the first of them; a window opened for a
 * session copy starts the copy in a new tab.
 */
export function usePromptWindowStartup(): void {
  const ready = useAppStore((s) => s.workspaceSessionReady)
  const openRepoId = queryValue(PROMPT_OPEN_REPO_QUERY)
  const openRepoLoaded = useAppStore((s) =>
    openRepoId ? (s.worktreesByRepo?.[openRepoId]?.length ?? 0) > 0 : true
  )

  useEffect(() => {
    if (!ready || !openRepoId || !openRepoLoaded) {
      return
    }
    dropOpenRepoQuery()
    const worktreeId = mainWorktreeIdOf(openRepoId)
    if (worktreeId) {
      showTab(worktreeId, null)
    }
  }, [ready, openRepoId, openRepoLoaded])

  useEffect(() => {
    if (!ready) {
      return
    }
    void window.api?.promptWindows?.takeFocusRequest().then((request) => {
      if (!request) {
        return
      }
      const tabId = request.startCommand
        ? startTabWithCommand(request.worktreeId, request.startCommand)
        : request.tabId
      showTab(request.worktreeId, tabId)
    })
  }, [ready])
}
