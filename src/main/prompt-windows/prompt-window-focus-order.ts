/** Prompt window keys, most recently focused last (prompt-windows.ts picks a hand-over target). */
const focusOrder: string[] = []
/** When each renderer (by web contents id) last typed into a terminal. */
const typedAt = new Map<number, number>()
const BUSY_MS = 3000

export function forgetPromptWindowFocus(key: string): void {
  const index = focusOrder.indexOf(key)
  if (index !== -1) {
    focusOrder.splice(index, 1)
  }
}

export function notePromptWindowFocused(key: string): void {
  forgetPromptWindowFocus(key)
  focusOrder.push(key)
}

/** The window focused most recently that `accept` takes, or null. */
export function lastFocusedPromptWindow(accept: (key: string) => boolean): string | null {
  for (let i = focusOrder.length - 1; i >= 0; i--) {
    if (accept(focusOrder[i]!)) {
      return focusOrder[i]!
    }
  }
  return null
}

export function notePromptWindowTyped(webContentsId: number): void {
  typedAt.set(webContentsId, Date.now())
}

/** Someone is using the window: it is focused and was typed into a moment ago. */
export function isPromptWindowBusy(
  win: { isFocused: () => boolean; webContents: { id: number } } | null
): boolean {
  if (!win || !win.isFocused()) {
    return false
  }
  return Date.now() - (typedAt.get(win.webContents.id) ?? 0) < BUSY_MS
}
