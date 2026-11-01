/** Prompt window keys, most recently focused last (prompt-windows.ts picks a hand-over target). */
const focusOrder: string[] = []

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
