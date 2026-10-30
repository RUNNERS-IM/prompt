import type { Store } from '../persistence'
import {
  PROMPT_MAIN_WINDOW_KEY as MAIN,
  promptRepoIdOfWorktreeId,
  type PromptWindowSummary
} from '../../shared/prompt-windows'
import { promptWindowView } from './prompt-window-registry'

/** Names and places of things for the window menus: which project a window shows, where a tab is. */

let store: Store | null = null

export function setPromptWindowLabelStore(appStore: Store | null): void {
  store = appStore
}

/** The workspace a saved tab is in, from the stored session. */
export function promptWorktreeIdOfTab(tabId: string): string | null {
  const session = store?.getWorkspaceSession() as unknown as Record<string, unknown> | undefined
  for (const field of ['tabsByWorktree', 'unifiedTabs', 'browserTabsByWorktree']) {
    const byWorktree = session?.[field] as Record<string, unknown> | undefined
    for (const [worktreeId, list] of Object.entries(byWorktree ?? {})) {
      if (
        Array.isArray(list) &&
        list.some((tab) => tab && (tab.id === tabId || tab.entityId === tabId))
      ) {
        return worktreeId
      }
    }
  }
  return null
}

export function promptRepoName(repoId: string | null | undefined): string | null {
  const repo = repoId ? store?.getRepos().find((candidate) => candidate.id === repoId) : undefined
  return repo ? repo.displayName || repo.path : null
}

function labelOf(key: string): string | null {
  const view =
    key === MAIN
      ? (store?.getWorkspaceSession() as unknown as Record<string, unknown> | undefined)
      : promptWindowView(key)
  const worktreeId = typeof view?.activeWorktreeId === 'string' ? view.activeWorktreeId : null
  const repoId =
    typeof view?.activeRepoId === 'string'
      ? view.activeRepoId
      : worktreeId
        ? promptRepoIdOfWorktreeId(worktreeId)
        : null
  return promptRepoName(repoId)
}

/** The open windows, main window first, for the "Move Tab to Window" menu. */
export function promptWindowSummaries(
  selfKey: string,
  extraKeys: Iterable<string>,
  isOpen: (key: string) => boolean
): PromptWindowSummary[] {
  const keys = [MAIN, ...extraKeys].filter(isOpen)
  return keys.map((key, index) => ({
    key,
    index: index + 1,
    label: labelOf(key),
    isSelf: key === selfKey
  }))
}
