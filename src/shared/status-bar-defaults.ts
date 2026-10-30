import type { StatusBarItem } from './ui-chrome-types'

// Prompt: only Claude usage by default; other segments can be turned back on from the status bar menu.
export const DEFAULT_STATUS_BAR_ITEMS: StatusBarItem[] = ['claude']
