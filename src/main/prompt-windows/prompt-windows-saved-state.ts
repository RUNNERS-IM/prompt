import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PromptWindowBounds } from './prompt-window-shell'

/**
 * The windows open at quit, kept in prompt-windows.json in the app's data folder (outside the
 * shared session file): each extra window's key, size and place and own selection, plus which
 * window shows each tab.
 */

export type PromptSavedWindow = {
  key: string
  bounds?: PromptWindowBounds
  view?: Record<string, unknown>
}

export type PromptSavedWindows = {
  windows: PromptSavedWindow[]
  tabOwners?: Record<string, string>
}

function savedStatePath(): string {
  return join(app.getPath('userData'), 'prompt-windows.json')
}

export function readPromptSavedWindows(): PromptSavedWindows {
  try {
    const parsed = JSON.parse(readFileSync(savedStatePath(), 'utf8')) as PromptSavedWindows
    return Array.isArray(parsed?.windows) ? parsed : { windows: [] }
  } catch {
    return { windows: [] }
  }
}

export function writePromptSavedWindows(
  windows: PromptSavedWindow[],
  tabOwners: Record<string, string>
): void {
  try {
    writeFileSync(savedStatePath(), JSON.stringify({ windows, tabOwners }, null, 2))
  } catch (error) {
    console.warn('[prompt-windows] could not save open windows', error)
  }
}
