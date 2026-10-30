import { join, resolve } from 'node:path'
import {
  LEGACY_USER_DATA_DIR_NAME,
  PROMPT_TEST_APP_DATA_DIR_ENV,
  PROMPT_USER_DATA_DIR_NAME,
  isPromptUserDataReady,
  readPromptUserDataMarker
} from '../../shared/prompt-user-data-location'
import { migrateLegacyUserData, type UserDataMigrationResult } from './prompt-user-data-migration'

export type PromptUserDataPinHost = {
  isPackaged: boolean
  getPath(name: 'appData'): string
  setPath(name: 'userData', value: string): void
  commandLine: { hasSwitch(name: string): boolean }
}

/** The inherited folder whose terminal daemons this launch may still adopt. */
export type PreMigrationUserData = {
  userDataPath: string
  /** Only daemons started before the move belong to Prompt; later ones are upstream Orca's. */
  migratedAtMs: number
}

let preMigrationUserData: PreMigrationUserData | null = null

export function getPreMigrationUserData(): PreMigrationUserData | null {
  return preMigrationUserData
}

/** Test seam. */
export function setPreMigrationUserDataForTest(value: PreMigrationUserData | null): void {
  preMigrationUserData = value
}

/**
 * Move packaged Prompt from the inherited `orca` userData folder to `Prompt`.
 *
 * Keeps app.getName() as `orca`, so the Keychain / keyring entry ("orca Safe Storage") that
 * encrypts saved tokens and cookies stays the same and copied values still decrypt.
 * Runs before anything reads userData.
 */
export function pinPromptUserDataPath(
  host: PromptUserDataPinHost,
  env: NodeJS.ProcessEnv = process.env
): UserDataMigrationResult | null {
  // Dev, E2E and explicit --user-data-dir launches choose their own profile.
  if (!host.isPackaged || host.commandLine.hasSwitch('user-data-dir')) {
    return null
  }
  if (env.ORCA_E2E_USER_DATA_DIR) {
    return null
  }
  const appData = env[PROMPT_TEST_APP_DATA_DIR_ENV]?.trim()
    ? resolve(env[PROMPT_TEST_APP_DATA_DIR_ENV]!.trim())
    : host.getPath('appData')
  const legacyDir = join(appData, LEGACY_USER_DATA_DIR_NAME)
  const targetDir = join(appData, PROMPT_USER_DATA_DIR_NAME)
  const result = migrateLegacyUserData({ legacyDir, targetDir })
  if (result.outcome === 'failed') {
    console.error(
      '[startup] Could not copy the Orca data folder to Prompt; using it as-is',
      result.error
    )
  } else if (result.outcome === 'migrated' || result.outcome === 'deferred-legacy-in-use') {
    console.warn(`[startup] userData ${result.outcome}: ${result.userDataPath}`)
  }
  host.setPath('userData', result.userDataPath)
  if (result.userDataPath === targetDir) {
    const marker = readPromptUserDataMarker(targetDir)
    preMigrationUserData = marker?.migratedFrom
      ? { userDataPath: marker.migratedFrom, migratedAtMs: marker.createdAtMs }
      : null
  }
  return result
}

/** Uninstall helpers: use the Prompt folder when it is ready, but never start a copy. */
export function selectPromptUserDataPathWithoutCopy(
  host: PromptUserDataPinHost,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (!host.isPackaged || host.commandLine.hasSwitch('user-data-dir')) {
    return
  }
  const appData = env[PROMPT_TEST_APP_DATA_DIR_ENV]?.trim()
    ? resolve(env[PROMPT_TEST_APP_DATA_DIR_ENV]!.trim())
    : host.getPath('appData')
  const targetDir = join(appData, PROMPT_USER_DATA_DIR_NAME)
  if (isPromptUserDataReady(targetDir)) {
    host.setPath('userData', targetDir)
  }
}
