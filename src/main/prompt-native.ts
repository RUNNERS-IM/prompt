import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getAppEnvironment, hasAppEnvironment } from '../shared/app-environment'

// Prompt's one native module (native/prompt-native, napi-rs). Parts inherited from Orca move into it one at a time.
export type PromptNative = {
  /** phys_footprint per pid on macOS (empty elsewhere), read off the main thread. */
  processFootprints(): Promise<{ pid: number; bytes: number }[]>
  /** UNUserNotificationCenter settings for this app's bundle; null outside a bundle or after a 3 s wait. */
  notificationStatus(): Promise<{ authorization: string; alert: string } | null>
  /** The keyboard layout as JSON (see macos-keyboard-layout-snapshot.ts); synchronous because TIS needs the main thread. */
  keyboardLayoutSnapshot(): string | null
  /** Adds ProcessType Interactive to Squirrel's ShipIt launchd job; false outside macOS or when Squirrel changed. */
  configureShipItScheduling?(): boolean
  /** Values of one registry key on Windows (null when it cannot be opened, or on other OSes). */
  windowsRegistryKey?(
    root: number,
    path: string
  ): { name: string; type: number; value?: string | number | number[] | string[] }[] | null
}

/** Packaged apps carry the slice's own file in Resources (electron-builder extraResources). */
export const PACKAGED_PROMPT_NATIVE_FILE = 'prompt-native.node'

let loaded: { module: PromptNative | null } | undefined

/**
 * Where the module lives: Resources when packaged, the build output in native/prompt-native in dev.
 * The relocated daemon host runs Electron as Node: it has a resourcesPath holding its own copy but no app environment.
 */
export function promptNativePath(): string | null {
  if (typeof process.resourcesPath === 'string') {
    const packaged = join(process.resourcesPath, PACKAGED_PROMPT_NATIVE_FILE)
    if (existsSync(packaged)) {
      return packaged
    }
  }
  if (!hasAppEnvironment()) {
    return null
  }
  const environment = getAppEnvironment()
  if (environment.isPackaged()) {
    return null
  }
  return join(
    environment.getAppPath(),
    'native',
    'prompt-native',
    `prompt-native.${process.platform}-${process.arch}.node`
  )
}

/** The loaded module, or null when it is missing or will not load (callers keep their older path). */
export function loadPromptNative(): PromptNative | null {
  if (!loaded) {
    loaded = { module: null }
    try {
      const path = promptNativePath()
      // Dev runs without `pnpm build:prompt-native` and Linux installs have no file; that is not an error.
      if (path && existsSync(path)) {
        // dlopen needs no module base: worker and orcad bundles are CommonJS, where import.meta.url is empty.
        const holder = { exports: {} }
        process.dlopen(holder, path)
        loaded.module = holder.exports as PromptNative
      }
    } catch {
      // A wrong-arch or quarantined file must degrade the feature, not crash the caller.
      loaded.module = null
    }
  }
  return loaded.module
}
