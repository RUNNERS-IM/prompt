import { systemPreferences, type BrowserWindow } from 'electron'

// Prompt: follow the user's macOS accent color instead of a fixed selection blue.
export function installMacAccentColor(mainWindow: BrowserWindow): void {
  let cssKey: string | null = null
  const apply = async (): Promise<void> => {
    if (mainWindow.isDestroyed()) {
      return
    }
    // getAccentColor returns RRGGBBAA; drop alpha so it works as a plain CSS color.
    const accent = systemPreferences.getAccentColor().slice(0, 6)
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
  systemPreferences.on('accent-color-changed', onAccentChanged)
  mainWindow.on('closed', () => {
    systemPreferences.removeListener('accent-color-changed', onAccentChanged)
  })
}
