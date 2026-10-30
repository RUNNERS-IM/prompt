import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { getAppEnvironment } from '../shared/app-environment'

// Prompt's one native module (native/prompt-native, napi-rs). Parts inherited from Orca move into it one at a time.
export type PromptNative = {
  /** phys_footprint per pid on macOS (empty elsewhere), read off the main thread. */
  processFootprints(): Promise<{ pid: number; bytes: number }[]>
  /** UNUserNotificationCenter settings for this app's bundle; null outside a bundle or after a 3 s wait. */
  notificationStatus(): Promise<{ authorization: string; alert: string } | null>
}

/** Packaged apps carry the slice's own file in Resources (electron-builder extraResources). */
export const PACKAGED_PROMPT_NATIVE_FILE = 'prompt-native.node'

const requireNative = createRequire(import.meta.url)
let loaded: { module: PromptNative | null } | undefined

/** Where the module lives: Resources when packaged, the build output in native/prompt-native in dev. */
export function promptNativePath(): string {
  const environment = getAppEnvironment()
  if (environment.isPackaged() && typeof process.resourcesPath === 'string') {
    return join(process.resourcesPath, PACKAGED_PROMPT_NATIVE_FILE)
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
      // Dev runs without `pnpm build:prompt-native` and non-mac installs have no file; that is not an error.
      if (existsSync(path)) {
        loaded.module = requireNative(path) as PromptNative
      }
    } catch {
      // A wrong-arch or quarantined file must degrade the feature, not crash the caller.
      loaded.module = null
    }
  }
  return loaded.module
}
