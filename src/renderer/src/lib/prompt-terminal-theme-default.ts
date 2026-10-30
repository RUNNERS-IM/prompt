// Prompt: settings saved before Prompt Dark existed hold Orca's default as an explicit value.
// Move those profiles to Prompt Dark once so the terminal matches the window; a later pick in
// Settings stays because the flag stops this from running again.
import type { GlobalSettings } from '../../../shared/global-settings-types'
import { DEFAULT_TERMINAL_THEME_DARK } from '../../../shared/terminal-theme-selection'

const MIGRATED_FLAG = 'prompt.terminalThemeDarkDefault.v1'
const ORCA_DEFAULT_DARK = 'Ghostty Default Style Dark'

function readFlag(): boolean {
  try {
    return window.localStorage.getItem(MIGRATED_FLAG) === '1'
  } catch {
    return true
  }
}

function writeFlag(): void {
  try {
    window.localStorage.setItem(MIGRATED_FLAG, '1')
  } catch {
    // Without storage the migration simply runs again next launch; it only rewrites the Orca default.
  }
}

export function promptTerminalThemeMigration(
  settings: GlobalSettings | null
): Partial<GlobalSettings> | null | undefined {
  if (!settings) {
    return undefined
  }
  return settings.terminalThemeDark === ORCA_DEFAULT_DARK
    ? { terminalThemeDark: DEFAULT_TERMINAL_THEME_DARK }
    : null
}

if (typeof window !== 'undefined' && !readFlag()) {
  void import('../store').then(({ useAppStore }) => {
    const apply = (settings: GlobalSettings | null): boolean => {
      const update = promptTerminalThemeMigration(settings)
      if (update === undefined) {
        return false
      }
      writeFlag()
      if (update) {
        void useAppStore.getState().updateSettings(update)
      }
      return true
    }
    if (apply(useAppStore.getState().settings)) {
      return
    }
    const unsubscribe = useAppStore.subscribe((state) => {
      if (apply(state.settings)) {
        unsubscribe()
      }
    })
  })
}
