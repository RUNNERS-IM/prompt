import { BrowserWindow } from 'electron'
import {
  isPromptExtraWindowSender,
  promptExtraWindowList,
  promptExtraWindowOf,
  promptPtyWebContents,
  promptTabOwnerKey
} from './prompt-window-registry'

/**
 * Which window a runtime request goes to. Orca sends runtime requests (reveal a pane, close a
 * tab, focus a terminal, menu commands …) to the main window. With extra windows, a request
 * about a tab or terminal goes to the window that shows it; the rest stay with the main window.
 */

/** Notices every window needs, whatever they name. */
const BROADCAST_CHANNELS = new Set([
  'worktrees:changed',
  'repos:changed',
  'runtime:sidebarInputsChanged',
  'browser:session:profilesChanged',
  'automations:changed',
  'worktree:baseStatus',
  'worktree:remoteBranchConflict'
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** The window that shows a tab (main when the tab belongs to the main window or is unknown). */
export function promptWindowForTab<T extends BrowserWindow>(main: T, tabId: unknown): T {
  const key = typeof tabId === 'string' ? promptTabOwnerKey(tabId) : null
  return (promptExtraWindowOf<T>(key) as T | null) ?? main
}

function targetOf(payload: unknown): BrowserWindow | null {
  if (!isRecord(payload)) {
    return null
  }
  if (typeof payload.tabId === 'string') {
    return promptExtraWindowOf<BrowserWindow>(promptTabOwnerKey(payload.tabId))
  }
  if (typeof payload.ptyId === 'string') {
    const contents = promptPtyWebContents<unknown>(null, payload.ptyId)
    return contents
      ? (promptExtraWindowList<BrowserWindow>().find((win) => win.webContents === contents) ?? null)
      : null
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
 * Wraps the main window's runtime notice sender: notices about a tab or terminal shown in an
 * extra window go to that window, shared notices go to every window, the rest to the main window.
 */
export function promptRoutedRuntimeSend(
  send: (channel: string, ...values: unknown[]) => boolean
): (channel: string, ...values: unknown[]) => boolean {
  return (channel, ...values) => {
    const windows = promptExtraWindowList<BrowserWindow>()
    if (windows.length === 0) {
      return send(channel, ...values)
    }
    if (BROADCAST_CHANNELS.has(channel)) {
      windows.forEach((win) => sendTo(win, channel, values))
      return send(channel, ...values)
    }
    const target = targetOf(values[0])
    return target ? sendTo(target, channel, values) : send(channel, ...values)
  }
}

/** A reply to a runtime request may come from the main window or an extra window. */
export function isPromptAppWindowSender(sender: { id: number }, main: { id: number }): boolean {
  return sender === main || sender.id === main.id || isPromptExtraWindowSender(sender)
}

/** Menu commands act on the focused extra window, else on the main window. */
export function promptMenuTargetWindow<T extends BrowserWindow>(
  main: T | null | undefined
): T | null {
  if (promptExtraWindowList().length === 0) {
    return main ?? null
  }
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && !focused.isDestroyed() && isPromptExtraWindowSender(focused.webContents)) {
    return focused as T
  }
  return main ?? null
}
