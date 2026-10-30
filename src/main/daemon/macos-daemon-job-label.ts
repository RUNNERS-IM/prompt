import { createHash } from 'node:crypto'
import { basename, resolve } from 'node:path'
import { PROTOCOL_VERSION } from './daemon-protocol-version'
import { LEGACY_USER_DATA_DIR_NAME } from '../../shared/prompt-user-data-location'

export const MAC_DAEMON_JOB_LABEL_PREFIX = 'im.runners.prompt.terminal'
/** Label prefix used while userData was the inherited `orca` folder (and by upstream Orca). */
export const LEGACY_MAC_DAEMON_JOB_LABEL_PREFIX = 'com.stablyai.orca.terminal'

/**
 * Keep labels stable across upgrades, isolated by profile and protocol. A profile still living in
 * the inherited `orca` folder keeps the inherited prefix, so its running daemons stay recoverable.
 */
export function macDaemonJobLabel(
  userDataPath: string,
  protocolVersion = PROTOCOL_VERSION
): string {
  const resolved = resolve(userDataPath)
  const profileKey = createHash('sha256').update(resolved).digest('hex').slice(0, 16)
  const prefix =
    basename(resolved).toLowerCase() === LEGACY_USER_DATA_DIR_NAME
      ? LEGACY_MAC_DAEMON_JOB_LABEL_PREFIX
      : MAC_DAEMON_JOB_LABEL_PREFIX
  return `${prefix}.${profileKey}.v${protocolVersion}`
}
