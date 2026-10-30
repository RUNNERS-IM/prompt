import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** Folder name Prompt keeps its settings, sessions and terminal state in. */
export const PROMPT_USER_DATA_DIR_NAME = 'Prompt'

/**
 * Folder name inherited from Orca (package.json "name"). Upstream Orca still uses it, so Prompt
 * only ever reads from it: the first launch copies it into the Prompt folder.
 */
export const LEGACY_USER_DATA_DIR_NAME = 'orca'

/** Written last into the Prompt folder; its presence means the folder is complete and in use. */
export const PROMPT_USER_DATA_MARKER_FILE = '.prompt-user-data.json'

/** Test-only: point the platform app-data root somewhere disposable (upgrade rehearsals). */
export const PROMPT_TEST_APP_DATA_DIR_ENV = 'PROMPT_TEST_APP_DATA_DIR'

export type PromptUserDataMarker = {
  version: 1
  /** When the Prompt folder became the active one. */
  createdAtMs: number
  /** Folder copied from, or null for a fresh install. */
  migratedFrom: string | null
  /**
   * Set only when this folder was created empty: no Prompt data and nothing inherited from Orca.
   * Folders from earlier builds lack it, so their profiles never count as first-run.
   */
  firstRunProfile?: true
  /**
   * Set with firstRunProfile: the next launch turns Yolo mode off once, then clears this flag.
   * Profiles made by earlier builds never have it, so their permission choice is never touched.
   */
  startYoloOff?: true
}

/** Electron's default appData root for this platform (before the app name is appended). */
export function resolvePlatformAppDataDir(
  platform: NodeJS.Platform = process.platform,
  homeDir: string = homedir(),
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const override = env[PROMPT_TEST_APP_DATA_DIR_ENV]?.trim()
  if (override) {
    return resolve(override)
  }
  if (platform === 'darwin') {
    return join(homeDir, 'Library', 'Application Support')
  }
  if (platform === 'win32') {
    const appData = env.APPDATA?.trim()
    return appData ? appData : null
  }
  return env.XDG_CONFIG_HOME?.trim() || join(homeDir, '.config')
}

export function readPromptUserDataMarker(userDataPath: string): PromptUserDataMarker | null {
  try {
    const raw = readFileSync(join(userDataPath, PROMPT_USER_DATA_MARKER_FILE), 'utf8')
    const parsed = JSON.parse(raw) as Partial<PromptUserDataMarker>
    if (parsed?.version !== 1 || typeof parsed.createdAtMs !== 'number') {
      return null
    }
    const migratedFrom = typeof parsed.migratedFrom === 'string' ? parsed.migratedFrom : null
    return {
      version: 1,
      createdAtMs: parsed.createdAtMs,
      migratedFrom,
      ...(parsed.firstRunProfile === true && migratedFrom === null
        ? {
            firstRunProfile: true as const,
            ...(parsed.startYoloOff === true ? { startYoloOff: true as const } : {})
          }
        : {})
    }
  } catch {
    return null
  }
}

export function writePromptUserDataMarker(dir: string, marker: PromptUserDataMarker): void {
  writeFileSync(join(dir, PROMPT_USER_DATA_MARKER_FILE), `${JSON.stringify(marker)}\n`, {
    mode: 0o600
  })
}

export function isPromptUserDataReady(userDataPath: string): boolean {
  return existsSync(join(userDataPath, PROMPT_USER_DATA_MARKER_FILE))
}

/**
 * The packaged app's default profile as seen from outside the app (CLI, plain Node hosts):
 * the Prompt folder once the app has finished moving to it, the inherited folder until then.
 */
export function resolveDefaultPromptUserDataPath(
  platform: NodeJS.Platform = process.platform,
  homeDir: string = homedir(),
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const appData = resolvePlatformAppDataDir(platform, homeDir, env)
  if (!appData) {
    return null
  }
  const promptPath = join(appData, PROMPT_USER_DATA_DIR_NAME)
  return isPromptUserDataReady(promptPath) ? promptPath : join(appData, LEGACY_USER_DATA_DIR_NAME)
}

/**
 * Terminals opened before the move still export the inherited folder. Once the Prompt folder is
 * ready, send those callers to it instead of the stale runtime pointer left in the old folder.
 */
export function redirectLegacyUserDataPath(
  userDataPath: string,
  platform: NodeJS.Platform = process.platform,
  homeDir: string = homedir(),
  env: NodeJS.ProcessEnv = process.env
): string {
  const appData = resolvePlatformAppDataDir(platform, homeDir, env)
  if (!appData) {
    return userDataPath
  }
  const legacyPath = join(appData, LEGACY_USER_DATA_DIR_NAME)
  const sameAsLegacy =
    platform === 'linux'
      ? resolve(userDataPath) === resolve(legacyPath)
      : resolve(userDataPath).toLowerCase() === resolve(legacyPath).toLowerCase()
  if (!sameAsLegacy) {
    return userDataPath
  }
  const promptPath = join(appData, PROMPT_USER_DATA_DIR_NAME)
  return isPromptUserDataReady(promptPath) ? promptPath : userDataPath
}
