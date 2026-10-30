import { existsSync, unlinkSync } from 'node:fs'
import {
  getDaemonHistoryDir as getHistoryDir,
  probeDaemonSocket as probeSocket
} from './daemon-launch-paths'
import { legacyDaemonProcessMayBeAlive } from './daemon-legacy-process-liveness'
import { DaemonPtyAdapter } from './daemon-pty-adapter'
import { getDaemonPidPath, getDaemonSocketPath, getDaemonTokenPath } from './daemon-spawner'
import { PREVIOUS_DAEMON_PROTOCOL_VERSIONS, PROTOCOL_VERSION } from './types'
import { daemonRuntimeDirFor } from './daemon-runtime-dir'
import { readDaemonPidRecord } from './daemon-endpoint-incarnation'

// Isolated runtimes must keep discovery history outside app userData.
export async function createLegacyDaemonAdapters(
  runtimeDir: string,
  historyPath = getHistoryDir()
): Promise<DaemonPtyAdapter[]> {
  const adapters: DaemonPtyAdapter[] = []
  for (const protocolVersion of PREVIOUS_DAEMON_PROTOCOL_VERSIONS) {
    const socketPath = getDaemonSocketPath(runtimeDir, protocolVersion)
    const tokenPath = getDaemonTokenPath(runtimeDir, protocolVersion)
    if (!(await probeSocket(socketPath))) {
      // Keep records when the PID probe succeeds: a transient socket failure must not orphan live sessions.
      if (!legacyDaemonProcessMayBeAlive(runtimeDir, protocolVersion)) {
        for (const stalePath of [
          getDaemonPidPath(runtimeDir, protocolVersion),
          getDaemonTokenPath(runtimeDir, protocolVersion)
        ]) {
          try {
            unlinkSync(stalePath)
          } catch {
            // Stale-record cleanup must not block discovery.
          }
        }
      }
      continue
    }
    // Preserve old-protocol sessions without respawning into new code and environment semantics.
    // Cleanup history so a later protocol reusing the session ID cannot restore stale scrollback.
    adapters.push(
      new DaemonPtyAdapter({
        socketPath,
        tokenPath,
        pidPath: getDaemonPidPath(runtimeDir, protocolVersion),
        profileScope: runtimeDir,
        runtimeDir,
        protocolVersion,
        historyPath
      })
    )
  }
  return adapters
}

export type PreviousDataFolder = {
  userDataPath: string
  /** When Prompt moved to its own folder; daemons started later are not Prompt's. */
  migratedAtMs: number
}

const ALL_KNOWN_PROTOCOL_VERSIONS = [PROTOCOL_VERSION, ...PREVIOUS_DAEMON_PROTOCOL_VERSIONS]

/**
 * Attach to terminal daemons still running from the folder Prompt used before it moved to its own
 * userData folder, so their terminals keep working instead of being started a second time.
 *
 * Read-only toward that folder: it belongs to upstream Orca as well. Stale records there are left
 * alone, daemons started after the move (Orca's) are skipped, and no daemon here is ever stopped.
 */
export async function createPreviousDataFolderDaemonAdapters(
  previous: PreviousDataFolder,
  historyPath = getHistoryDir(),
  probe: (socketPath: string) => Promise<boolean> = probeSocket
): Promise<DaemonPtyAdapter[]> {
  const runtimeDir = daemonRuntimeDirFor(previous.userDataPath)
  const adapters: DaemonPtyAdapter[] = []
  for (const protocolVersion of ALL_KNOWN_PROTOCOL_VERSIONS) {
    const socketPath = getDaemonSocketPath(runtimeDir, protocolVersion)
    const pidPath = getDaemonPidPath(runtimeDir, protocolVersion)
    if (!existsSync(pidPath) || !(await probe(socketPath))) {
      continue
    }
    const startedAtMs = readDaemonPidRecord(pidPath)?.startedAtMs ?? null
    if (startedAtMs === null || startedAtMs > previous.migratedAtMs) {
      console.warn(
        `[daemon] leaving daemon v${protocolVersion} in ${runtimeDir} alone: not started by Prompt before the data folder moved`
      )
      continue
    }
    adapters.push(
      new DaemonPtyAdapter({
        socketPath,
        tokenPath: getDaemonTokenPath(runtimeDir, protocolVersion),
        pidPath,
        profileScope: runtimeDir,
        runtimeDir,
        protocolVersion,
        historyPath,
        fromPreviousDataFolder: true
      })
    )
  }
  return adapters
}
