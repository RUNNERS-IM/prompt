import type {
  KeyboardLayoutKeyCharacters,
  KeyboardLayoutSnapshot
} from '../../shared/keyboard-layout-snapshot'
import { loadPromptNative } from '../prompt-native'

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function parseKeyboardLayoutSnapshot(stdout: string): KeyboardLayoutSnapshot | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') {
    return null
  }
  const record = parsed as Record<string, unknown>
  if (!record.keyCharacters || typeof record.keyCharacters !== 'object') {
    return null
  }
  const keyCharacters: Record<string, KeyboardLayoutKeyCharacters> = {}
  for (const [code, value] of Object.entries(record.keyCharacters)) {
    if (!value || typeof value !== 'object') {
      continue
    }
    const characters = value as Record<string, unknown>
    keyCharacters[code] = {
      unmodified: optionalString(characters.unmodified),
      shifted: optionalString(characters.shifted)
    }
  }
  return {
    inputSourceId: optionalString(record.inputSourceId),
    layoutSourceId: optionalString(record.layoutSourceId),
    keyCharacters
  }
}

/** Reads through Prompt's native module, which calls Carbon's TIS API on this (main) thread as macOS requires. */
export function readMacKeyboardLayoutSnapshot(): Promise<KeyboardLayoutSnapshot | null> {
  if (process.platform !== 'darwin') {
    return Promise.resolve(null)
  }
  let json: string | null = null
  try {
    json = loadPromptNative()?.keyboardLayoutSnapshot() ?? null
  } catch {
    // An older module without this export, or a failed read, leaves the renderer on its conservative defaults.
    return Promise.resolve(null)
  }
  return Promise.resolve(json === null ? null : parseKeyboardLayoutSnapshot(json))
}

/** Reads finish synchronously, so a layout change never has to wait for one in flight. */
export async function waitForMacKeyboardLayoutSnapshotIdle(): Promise<void> {}
