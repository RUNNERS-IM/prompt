import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import { dispatchWorkspaceTabCommand } from '@/lib/workspace-tab-commands'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { persistAgentLaunchTabOrder } from '@/lib/launch-agent-tab-order'
import { createWebRuntimeSessionTerminal } from '@/runtime/web-runtime-terminal-creation'
import { isWebRuntimeSessionActive } from '@/runtime/web-runtime-session-environment'
import { resolveGroupTabFromVisibleId } from '@/components/tab-group/tab-group-visible-id'
import { closeTerminalTab } from '@/components/terminal/terminal-tab-actions'
import { requestTerminalTabRename } from '@/components/tab-bar/terminal-tab-rename-request'
import { resolveTerminalAgentTabShortcut } from '@/components/terminal-agent-tab-shortcut'
import { launchAgentTabShortcut } from '@/components/agent-tab-shortcut-launch'
import { getActiveWorktreeRuntimeEnvironmentId } from '@/components/terminal-workspace-model'
import type { Worktree } from '../../../../shared/worktree/types'

// Prompt sidebar session actions (decisions 1B, 2A, 3A). Each one goes through the same path as
// its tab-strip twin, so the sidebar and the tab strip behave alike (the close confirm included).

/** Workspace a project header's "+" targets: the main worktree, else the first one listed. */
export function promptHeaderTargetWorktree(worktrees: readonly Worktree[]): Worktree | undefined {
  return worktrees.find((worktree) => worktree.isMainWorktree) ?? worktrees[0]
}

function targetGroupId(worktreeId: string): string | undefined {
  const state = useAppStore.getState()
  return (
    state.activeGroupIdByWorktree?.[worktreeId] ?? state.groupsByWorktree?.[worktreeId]?.[0]?.id
  )
}

/** New Claude session in this workspace: the same launch as the "new agent tab" shortcut (⌥⌘T). */
export function startPromptClaudeSession(worktreeId: string): void {
  if (activateAndRevealWorktree(worktreeId) === false) {
    return
  }
  const shortcut = resolveTerminalAgentTabShortcut({
    activeWorktreeId: worktreeId,
    keybindings: useAppStore.getState().keybindings,
    matchShortcut: (actionId) => actionId === 'tab.newAgent'
  })
  // New tabs join the end of the strip, so the new row lands last in its workspace (decision 4A).
  launchAgentTabShortcut(
    worktreeId,
    shortcut,
    () => useAppStore.getState().activeWorktreeId === worktreeId
  )
}

/** New plain terminal in this workspace, as the "new terminal tab" shortcut (⌘T) makes one. */
export function startPromptTerminal(worktreeId: string): void {
  if (activateAndRevealWorktree(worktreeId) === false) {
    return
  }
  const groupId = targetGroupId(worktreeId)
  const environmentId = getActiveWorktreeRuntimeEnvironmentId(worktreeId)
  if (isWebRuntimeSessionActive(environmentId)) {
    void createWebRuntimeSessionTerminal(
      { worktreeId, environmentId, targetGroupId: groupId, activate: true },
      { userAct: true }
    )
    return
  }
  const state = useAppStore.getState()
  if (groupId) {
    void state.openNewTerminalTabInActiveWorkspace(groupId)
    return
  }
  const tabId = createBrowserUuid()
  state.createTab(worktreeId, undefined, undefined, { id: tabId })
  state.setActiveTabType('terminal', worktreeId)
  persistAgentLaunchTabOrder(worktreeId, tabId)
  focusTerminalTabSurface(tabId)
}

/**
 * Close one session from the sidebar. Same command as ⌘W and the tab ×, so a session with a
 * running program asks first and an idle one closes at once (decision 3A).
 */
export function closePromptSession(worktreeId: string, terminalTabId: string): void {
  const groupTabs = useAppStore.getState().unifiedTabsByWorktree?.[worktreeId] ?? []
  const item = resolveGroupTabFromVisibleId(groupTabs, terminalTabId)
  if (item) {
    dispatchWorkspaceTabCommand({
      type: 'close',
      target: { kind: 'tab', worktreeId, tabId: item.id }
    })
    return
  }
  // Same fallback as the tab strip: a just-launched tab may not have its unified entry yet.
  closeTerminalTab(terminalTabId)
}

/** Show the session's tab and open its inline rename, as the tab menu's rename does. */
export function renamePromptSession(worktreeId: string, terminalTabId: string): void {
  activateAndRevealWorktree(worktreeId)
  const leafId = useAppStore.getState().terminalLayoutsByTabId?.[terminalTabId]?.activeLeafId
  activateTabAndFocusPane(terminalTabId, leafId ?? null)
  // The tab mounts its rename field on the next frame when it was not on screen yet.
  requestAnimationFrame(() => requestTerminalTabRename(terminalTabId))
}

export function setPromptSessionColor(terminalTabId: string, color: string | null): void {
  useAppStore.getState().setTabColor(terminalTabId, color)
}
