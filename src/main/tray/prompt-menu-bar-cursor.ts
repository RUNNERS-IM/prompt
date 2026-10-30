// Prompt's menu bar cursor blinks every 2.4s (half on, half off) while any agent is working,
// and stays lit once every agent is idle. The timer keeps ticking so blinking starts within one half period.
export const CURSOR_BLINK_HALF_PERIOD_MS = 1200

let cursorVisible = true
let cursorBlinkTimer: ReturnType<typeof setInterval> | null = null

export function isMenuBarCursorVisible(): boolean {
  return cursorVisible
}

function hasWorkingAgent(getWorkingAgentCount: (() => number) | undefined): boolean {
  try {
    return (getWorkingAgentCount?.() ?? 0) > 0
  } catch (error) {
    console.warn('[system-tray] working agent count unavailable', error)
    return false
  }
}

/** Calls onChange only when the cursor turns on or off, so idle menu bars are never repainted. */
export function startMenuBarCursorBlink(
  getWorkingAgentCount: () => (() => number) | undefined,
  onChange: () => void
): void {
  if (cursorBlinkTimer) {
    return
  }
  cursorBlinkTimer = setInterval(() => {
    const nextVisible = hasWorkingAgent(getWorkingAgentCount()) ? !cursorVisible : true
    if (nextVisible === cursorVisible) {
      return
    }
    cursorVisible = nextVisible
    onChange()
  }, CURSOR_BLINK_HALF_PERIOD_MS)
}

export function stopMenuBarCursorBlink(): void {
  if (cursorBlinkTimer) {
    clearInterval(cursorBlinkTimer)
    cursorBlinkTimer = null
  }
  cursorVisible = true
}
