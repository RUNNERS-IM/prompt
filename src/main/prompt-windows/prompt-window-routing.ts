import { BrowserWindow } from 'electron'
import { promptRepoIdOfWorktreeId } from '../../shared/prompt-project-windows'
import {
  isPromptProjectWindowSender,
  promptProjectWindowList,
  promptProjectWindowOf,
  promptPtyOwnerRepoId,
  promptStoredWorkspaceSession
} from './prompt-project-window-registry'

const promptProjectBrowserWindow = (repoId: string | null | undefined): BrowserWindow | null =>
  promptProjectWindowOf<BrowserWindow>(repoId)
const promptProjectBrowserWindows = (): BrowserWindow[] => promptProjectWindowList<BrowserWindow>()

/**
 * Which window a request about a project goes to. Orca sends runtime requests (new terminal from
 * the CLI, reveal a pane, close a tab, menu commands …) to the main window. While a project is
 * open in its own window, requests about that project go to that window instead.
 */

/** Notices every window needs, whatever project they name. */
const BROADCAST_CHANNELS = new Set([
  'worktrees:changed',
  'repos:changed',
  'runtime:sidebarInputsChanged',
  'browser:session:profilesChanged',
  'automations:changed',
  'worktree:baseStatus',
  'worktree:remoteBranchConflict'
])

const TAB_LIST_KEYS = ['tabsByWorktree', 'unifiedTabs', 'browserTabsByWorktree'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** The project a saved tab belongs to, or null when the tab is not saved yet. */
export function promptRepoIdOfTab(tabId: string): string | null {
  const session = promptStoredWorkspaceSession()
  if (!isRecord(session)) {
    return null
  }
  for (const key of TAB_LIST_KEYS) {
    const byWorktree = session[key]
    if (!isRecord(byWorktree)) {
      continue
    }
    for (const [worktreeId, list] of Object.entries(byWorktree)) {
      if (Array.isArray(list) && list.some((tab) => isRecord(tab) && tab.id === tabId)) {
        return promptRepoIdOfWorktreeId(worktreeId)
      }
    }
  }
  return null
}

export function promptWindowForWorktree<T extends BrowserWindow>(main: T, worktreeId: unknown): T {
  const repoId = typeof worktreeId === 'string' ? promptRepoIdOfWorktreeId(worktreeId) : null
  return (promptProjectBrowserWindow(repoId) as T | null) ?? main
}

export function promptWindowForTab<T extends BrowserWindow>(main: T, tabId: unknown): T {
  const repoId = typeof tabId === 'string' ? promptRepoIdOfTab(tabId) : null
  return (promptProjectBrowserWindow(repoId) as T | null) ?? main
}

/** The project window when every worktree belongs to its project, else the main window. */
export function promptWindowForWorktrees<T extends BrowserWindow>(
  main: T,
  worktreeIds: readonly string[]
): T {
  const repoIds = new Set(worktreeIds.map((id) => promptRepoIdOfWorktreeId(id)))
  return repoIds.size === 1 ? promptWindowForWorktree(main, worktreeIds[0]) : main
}

function scopeRepoIdOf(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null
  }
  if (typeof payload.worktreeId === 'string') {
    return promptRepoIdOfWorktreeId(payload.worktreeId)
  }
  if (typeof payload.repoId === 'string') {
    return payload.repoId
  }
  if (typeof payload.tabId === 'string') {
    return promptRepoIdOfTab(payload.tabId)
  }
  if (typeof payload.ptyId === 'string') {
    return promptPtyOwnerRepoId(payload.ptyId)
  }
  return null
}

function sendTo(win: BrowserWindow, channel: string, values: unknown[]): boolean {
  if (win.isDestroyed() || win.webContents.isDestroyed()) {
    return false
  }
  try {
    win.webContents.send(channel, ...values)
    return true
  } catch {
    return false
  }
}

/**
 * Wraps the main window's runtime notice sender: notices about a project open in its own window
 * go to that window, shared notices go to every window, the rest to the main window as before.
 */
export function promptRoutedRuntimeSend(
  send: (channel: string, ...values: unknown[]) => boolean
): (channel: string, ...values: unknown[]) => boolean {
  return (channel, ...values) => {
    const windows = promptProjectBrowserWindows()
    if (windows.length === 0) {
      return send(channel, ...values)
    }
    if (BROADCAST_CHANNELS.has(channel)) {
      windows.forEach((win) => sendTo(win, channel, values))
      return send(channel, ...values)
    }
    const target = promptProjectBrowserWindow(scopeRepoIdOf(values[0]))
    return target ? sendTo(target, channel, values) : send(channel, ...values)
  }
}

/** A reply to a runtime request may come from the main window or a project window. */
export function isPromptAppWindowSender(sender: { id: number }, main: { id: number }): boolean {
  return sender === main || sender.id === main.id || isPromptProjectWindowSender(sender)
}

/** Menu commands act on the focused project window, else on the main window. */
export function promptMenuTargetWindow<T extends BrowserWindow>(
  main: T | null | undefined
): T | null {
  if (promptProjectWindowList().length === 0) {
    return main ?? null
  }
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && !focused.isDestroyed() && isPromptProjectWindowSender(focused.webContents)) {
    return focused as T
  }
  return main ?? null
}
