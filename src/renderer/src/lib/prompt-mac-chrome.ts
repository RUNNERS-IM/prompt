// Prompt: the macOS desktop window is created with sidebar vibrancy; flag the document so CSS can float the sidebar as a translucent card.
// Electron's token is stripped from the user agent, so the desktop index.html's native-shell class marks the desktop shell.
const root = typeof document !== 'undefined' ? document.documentElement : null
const isMacDesktopShell =
  root !== null && root.classList.contains('native-shell') && /Macintosh/.test(navigator.userAgent)

if (isMacDesktopShell) {
  root.classList.add('prompt-mac-vibrancy')
}
