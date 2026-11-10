import { toast } from 'sonner'
import { absolutePathToFileUri } from '@/components/editor/markdown-internal-links'
import { promptTerminalTabName } from '@/components/sidebar/prompt-session-row-name'
import { translate } from '@/i18n/i18n'
import { activateBrowserWorkspaceTab } from '@/lib/browser-workspace-tab-activation'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { useAppStore } from '@/store'
import type { PromptDecisionDraft } from '../../../../shared/prompt-decision-inbox'

export type PromptDecisionSession = { worktreeId: string; tabId: string; leafId: string }

/** Finds the live session a page came from; a sleeping tab with the same name can't take an answer. */
export function findPromptDecisionSession(sessionName: string): PromptDecisionSession | null {
  const state = useAppStore.getState()
  let found: PromptDecisionSession | null = null
  for (const [worktreeId, tabs] of Object.entries(state.tabsByWorktree)) {
    for (const tab of tabs) {
      if (promptTerminalTabName(tab).normalize('NFC') !== sessionName) {
        continue
      }
      const layout = state.terminalLayoutsByTabId[tab.id]
      const leafId = layout?.activeLeafId ?? Object.keys(layout?.ptyIdsByLeafId ?? {})[0]
      if (!leafId) {
        continue
      }
      if (tab.ptyId) {
        return { worktreeId, tabId: tab.id, leafId }
      }
      found ??= { worktreeId, tabId: tab.id, leafId }
    }
  }
  return found
}

export function openPromptDecisionDraft(draft: PromptDecisionDraft): void {
  const state = useAppStore.getState()
  const worktreeId =
    findPromptDecisionSession(draft.sessionName)?.worktreeId ?? state.activeWorktreeId
  if (!worktreeId) {
    toast.error(translate('prompt.decisionInbox.noWorkspace', 'Open a project to view this page'))
    return
  }
  activateAndRevealWorktree(worktreeId, { providesInitialSurface: true })
  const fileUrl = absolutePathToFileUri(draft.filePath)
  const existing = (useAppStore.getState().browserTabsByWorktree[worktreeId] ?? []).find(
    (workspace) => workspace.url === fileUrl
  )
  if (existing && activateBrowserWorkspaceTab({ worktreeId, workspaceId: existing.id })) {
    return
  }
  state.createBrowserTab(worktreeId, fileUrl, {
    title: draft.topic,
    activate: true,
    // Why: the page is on this computer, so a paired-server runtime must not adopt it.
    browserRuntimeEnvironmentId: null
  })
}
