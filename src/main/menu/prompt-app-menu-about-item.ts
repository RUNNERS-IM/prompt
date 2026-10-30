import { app } from 'electron'
import { translateMain } from '../i18n/main-i18n'

// Prompt: "About Prompt" opens Prompt's own About window (RUNNERS app cards) when the host passes
// onShowAbout; without it the menu keeps Electron's native About role.
export function createPromptAboutItem(options: {
  onShowAbout?: () => void
  appMenuLabel?: string
}): Electron.MenuItemConstructorOptions {
  if (!options.onShowAbout) {
    return { role: 'about' }
  }
  return {
    label: translateMain('prompt.about.menuLabel', 'About {{name}}', {
      name: options.appMenuLabel ?? app.name
    }),
    click: options.onShowAbout
  }
}
