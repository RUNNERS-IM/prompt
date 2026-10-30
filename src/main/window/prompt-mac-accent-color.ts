import { systemPreferences, type BrowserWindow } from 'electron'

// Electron always provides systemPreferences in the macOS main process, so this returns it
// unchanged in the app. The electron mocks in the unit tests inherited from Orca leave it out,
// and Vitest throws as soon as a missing mock export is read; returning null there skips only the
// accent tint instead of failing every createMainWindow test.
function readSystemPreferences(): typeof systemPreferences | null {
  try {
    return systemPreferences
  } catch {
    return null
  }
}

// Prompt: follow the user's macOS accent color instead of a fixed selection blue.
export function installMacAccentColor(mainWindow: BrowserWindow): void {
  const preferences = readSystemPreferences()
  if (!preferences) {
    return
  }
  let cssKey: string | null = null
  const apply = async (): Promise<void> => {
    if (mainWindow.isDestroyed()) {
      return
    }
    // getAccentColor returns RRGGBBAA; drop alpha so it works as a plain CSS color.
    const accent = preferences.getAccentColor().slice(0, 6)
    const css = /^[0-9a-f]{6}$/i.test(accent) ? `html:root{--prompt-accent:#${accent}}` : null
    const contents = mainWindow.webContents
    if (cssKey) {
      await contents.removeInsertedCSS(cssKey).catch(() => {})
      cssKey = null
    }
    if (css) {
      cssKey = await contents.insertCSS(css).catch(() => null)
    }
  }
  const onLoad = (): void => {
    cssKey = null
    void apply()
  }
  const onAccentChanged = (): void => void apply()
  mainWindow.webContents.on('did-finish-load', onLoad)
  preferences.on('accent-color-changed', onAccentChanged)
  mainWindow.on('closed', () => {
    preferences.removeListener('accent-color-changed', onAccentChanged)
  })
}
