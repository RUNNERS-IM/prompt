import type { Terminal } from '@xterm/xterm'

/**
 * Claude Code wraps each repaint in DEC 2026 and moves the cursor up to rewrite earlier rows inside
 * it. xterm holds the cells until the frame ends, but its composition overlay follows the cursor on
 * every render, so mid-frame it jumps to a row above and draws that row's text over the screen
 * (Hangul rows overlapping, a stray ㄱ). Hold the overlay hidden while the frame is open and show it
 * again on the first render after it closes, once xterm has put it back on the cursor row. xterm
 * never writes the overlay's `visibility`, so the inline style is ours alone.
 */
export function installTerminalImeSyncOutputHold(terminal: Terminal): (() => void) | null {
  const compositionView = terminal.element?.querySelector<HTMLElement>('.composition-view')
  if (!compositionView) {
    return null
  }
  let held = false
  const writeParsed = terminal.onWriteParsed(() => {
    if (terminal.modes.synchronizedOutputMode && !held) {
      held = true
      compositionView.style.visibility = 'hidden'
    }
  })
  const rendered = terminal.onRender(() => {
    if (held && !terminal.modes.synchronizedOutputMode) {
      held = false
      compositionView.style.visibility = ''
    }
  })
  return () => {
    writeParsed.dispose()
    rendered.dispose()
    compositionView.style.visibility = ''
  }
}
