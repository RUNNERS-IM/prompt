import { logicalKeyTokenFromInput, physicalCodeKeyTokenFromInput } from '../../shared/keybindings'

// Prompt: Cmd+N must open a window even while a terminal has focus; xterm's kitty keyboard turns it
// into CSI-u and prevents default, so the Window menu's key equivalent never fires. Windows/Linux
// keep Ctrl+N for the shell (readline next-history).
export function isMacNewWindowInput(input: Electron.Input): boolean {
  return (
    process.platform === 'darwin' &&
    input.type === 'keyDown' &&
    input.meta &&
    !input.control &&
    !input.alt &&
    !input.shift &&
    (logicalKeyTokenFromInput(input) ?? physicalCodeKeyTokenFromInput(input)) === 'N'
  )
}
