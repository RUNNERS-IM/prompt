import { getAppEnvironment, hasAppEnvironment } from '../../shared/app-environment'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import {
  LEGACY_USER_DATA_DIR_NAME,
  resolveDefaultPromptUserDataPath
} from '../../shared/prompt-user-data-location'

// Use the environment port for plain Node hosts. Keep userData/logs on macOS
// because Electron’s logs path would strand existing bundles.
function getUserDataDir(): string {
  if (hasAppEnvironment()) {
    return getAppEnvironment().getPath('userData')
  }
  const home = homedir()
  // Same folder the packaged app uses: Prompt once it moved there, the inherited one before.
  const resolved = resolveDefaultPromptUserDataPath(platform(), home)
  if (resolved) {
    return resolved
  }
  return join(process.env.APPDATA ?? home, LEGACY_USER_DATA_DIR_NAME)
}

export function getLogsDirectory(): string {
  return join(getUserDataDir(), 'logs')
}

export function getTraceFilePath(): string {
  return join(getLogsDirectory(), 'main.trace.ndjson')
}

export function getOrcadTraceFilePath(): string {
  return join(getLogsDirectory(), 'orcad.trace.ndjson')
}

export function getDaemonLogFilePath(): string {
  return join(getLogsDirectory(), 'daemon.log')
}
