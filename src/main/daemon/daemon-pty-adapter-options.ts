import type { ReadRunningWslDistros } from './daemon-wsl-bridge-exit'
import type { WslBridgeBootIdentity } from './daemon-wsl-bridge-boot-identity'

export type DaemonPtyAdapterOptions = {
  socketPath: string
  tokenPath: string
  pidPath?: string
  profileScope?: string
  protocolVersion?: number
  historyPath?: string
  runtimeDir?: string
  packagedAppVersion?: string | null
  respawn?: (reason: DaemonRespawnReason) => Promise<void | (() => void)>
  /** Test seam; production reads the shared, coalesced `wsl --list --running`. */
  readRunningWslDistros?: ReadRunningWslDistros
  /** Test seam; production reads each distro's boot id through the background-work gate. */
  wslBridgeBootIdentity?: WslBridgeBootIdentity
  /**
   * A daemon still running from the userData folder Prompt used before it moved to its own
   * folder. Upstream Orca shares that folder, so Prompt only attaches to sessions it knows:
   * it never kills unknown sessions there and never asks that daemon to retire.
   */
  fromPreviousDataFolder?: boolean
}

export type DaemonRespawnReason =
  | 'daemon_died'
  | 'unhealthy_resolver'
  | 'stale_bundle'
  | 'severed_tcc_attribution'
