import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { getEndpointFileName } from '../../../shared/agent-hook-listener/endpoint-publication'
import {
  getPreMigrationUserData,
  type PreMigrationUserData
} from '../../startup/prompt-user-data-pin'
import { isUserDataFolderInUse } from '../../startup/prompt-user-data-migration'
import { readDaemonPidRecord } from '../../daemon/daemon-endpoint-incarnation'

export type PreviousFolderEndpointMirrorDeps = {
  previous?: PreMigrationUserData | null
  isFolderInUse?: (dir: string) => boolean
  hasPromptDaemon?: (previous: PreMigrationUserData) => boolean
}

/** A daemon Prompt started before the move is still alive there (its terminals read the file). */
export function hasPromptDaemonInPreviousFolder(previous: PreMigrationUserData): boolean {
  const runtimeDir = join(previous.userDataPath, 'daemon')
  let names: string[]
  try {
    names = readdirSync(runtimeDir)
  } catch {
    return false
  }
  return names.some((name) => {
    if (!/^daemon-v\d+\.pid$/.test(name)) {
      return false
    }
    const record = readDaemonPidRecord(join(runtimeDir, name))
    if (!record || record.startedAtMs === null || record.startedAtMs > previous.migratedAtMs) {
      return false
    }
    try {
      process.kill(record.pid, 0)
      return true
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'EPERM'
    }
  })
}

/**
 * Terminals opened before Prompt moved its data folder read the hook endpoint (port and token)
 * from the old folder on every agent event. Keep that one file current so their agent status
 * still reaches Prompt, but only while no other app (upstream Orca) is using the old folder.
 */
export function mirrorEndpointToPreviousDataFolder(
  write: (endpointDir: string, endpointFile: string) => boolean,
  deps: PreviousFolderEndpointMirrorDeps = {}
): boolean {
  const previous = deps.previous === undefined ? getPreMigrationUserData() : deps.previous
  if (!previous) {
    return false
  }
  const endpointDir = join(previous.userDataPath, 'agent-hooks')
  const endpointFile = join(endpointDir, getEndpointFileName())
  // Only replace a file an earlier Prompt wrote; never create state in the old folder.
  if (!existsSync(endpointFile)) {
    return false
  }
  // Nothing left to keep working once the pre-move terminals are gone.
  const hasPromptDaemon = deps.hasPromptDaemon ?? hasPromptDaemonInPreviousFolder
  if (!hasPromptDaemon(previous)) {
    return false
  }
  const isFolderInUse = deps.isFolderInUse ?? ((dir: string) => isUserDataFolderInUse(dir))
  if (isFolderInUse(previous.userDataPath)) {
    return false
  }
  return write(endpointDir, endpointFile)
}
