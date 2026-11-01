import { forgetPromptSharedBases } from './prompt-session-shared'
import {
  forgetPromptSharedWindow,
  isPromptWindowBehind,
  setPromptSharedSavedListener
} from './prompt-shared-sync'
import { isPromptWindowBusy } from './prompt-window-focus-order'

/**
 * Prompt shared tabs: reloads a window that is behind (prompt-shared-sync.ts) so it shows the tabs
 * the other windows opened, split, renamed or closed. Checked shortly after every save, and again a
 * few seconds later for closed tabs (a window normally closes those itself when their terminal
 * exits). A window someone is typing in waits until they pause, so no keystroke lands in a page
 * that is going away.
 */

type WindowLike = {
  isDestroyed: () => boolean
  isFocused: () => boolean
  webContents: { id: number; isDestroyed: () => boolean; reload: () => void }
}

export type PromptSharedReloadHost = {
  /** Keys of the windows, the main one included. */
  keys: () => string[]
  /** The open window of a key, or null. */
  windowOf: (key: string) => WindowLike | null
}

const FIRST_CHECK_MS = 500
const LATE_CHECK_MS = 4000
const RETRY_MS = 1000

let host: PromptSharedReloadHost | null = null
const waiting = new Set<string>()
let retryTimer: ReturnType<typeof setTimeout> | null = null

function reloadWaiting(): void {
  retryTimer = null
  for (const key of waiting) {
    const win = host?.windowOf(key) ?? null
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {
      waiting.delete(key)
    } else if (!isPromptWindowBusy(win)) {
      waiting.delete(key)
      forgetPromptSharedWindow(key)
      win.webContents.reload()
    }
  }
  if (waiting.size > 0) {
    retryTimer = setTimeout(reloadWaiting, RETRY_MS)
    retryTimer.unref?.()
  }
}

function check(late: boolean): void {
  const keys = (host?.keys() ?? []).filter((key) => host?.windowOf(key))
  // One window has nobody to catch up with.
  if (keys.length < 2) {
    return
  }
  for (const key of keys) {
    if (!waiting.has(key) && isPromptWindowBehind(key, late)) {
      waiting.add(key)
    }
  }
  if (waiting.size > 0 && !retryTimer) {
    reloadWaiting()
  }
}

function later(ms: number, late: boolean): void {
  const timer = setTimeout(() => check(late), ms)
  timer.unref?.()
}

export function installPromptSharedReload(next: PromptSharedReloadHost): void {
  host = next
  setPromptSharedSavedListener(() => {
    later(FIRST_CHECK_MS, false)
    later(LATE_CHECK_MS, true)
  })
}

/**
 * A window closed (nothing to reload, nothing it held to catch up with), or navigated (`closed`
 * false: it holds nothing until it reads the session again).
 */
export function forgetPromptSharedReloadWindow(key: string, closed = true): void {
  forgetPromptSharedWindow(key, closed)
  if (closed) {
    waiting.delete(key)
    forgetPromptSharedBases(key)
  }
}

/** Test seam: run the checks now. */
export function checkPromptSharedReloadForTests(late: boolean): void {
  check(late)
}

/** Test seam. */
export function resetPromptSharedReloadForTests(): void {
  host = null
  waiting.clear()
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}
