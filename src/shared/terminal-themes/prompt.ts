import { DEFAULT_TERMINAL_THEMES } from './defaults'
import type { TerminalThemeMap } from './types'

// Prompt: Ghostty colors on the Prompt card surface (#292929 = white 5% over the #1e1e1e window),
// so the terminal and its tab strip share one background. Light mode keeps Builtin Tango Light,
// which is already white like the light card.
export const PROMPT_TERMINAL_THEMES: TerminalThemeMap = {
  'Prompt Dark': {
    ...DEFAULT_TERMINAL_THEMES['Ghostty Default Style Dark'],
    background: '#292929',
    cursorAccent: '#292929'
  }
}
