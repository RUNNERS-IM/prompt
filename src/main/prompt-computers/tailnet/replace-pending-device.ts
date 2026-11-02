import { isPendingTokenRow } from '../../runtime/device-entry'
import type { DeviceRegistry, DeviceScope, TokenDeviceEntry } from '../../runtime/device-registry'
import type { RuntimePairingReach } from '../../../shared/runtime-pairing-reach'

/**
 * Prompt: Tailscale auto-pairing gives each caller its own link. A new request from the same
 * caller replaces that caller's unused link, so failed attempts do not pile up, and the shared
 * pending link the share dialog shows is never handed to someone else.
 * Kept in a Prompt-only file so the daily upstream merge does not conflict.
 */
export function replacePendingDeviceNamed(
  registry: Pick<DeviceRegistry, 'listDevices' | 'removeDevice' | 'addDevice'>,
  name: string,
  scope: DeviceScope,
  reach: RuntimePairingReach
): TokenDeviceEntry {
  for (const device of registry.listDevices()) {
    if (isPendingTokenRow(device) && device.name === name) {
      registry.removeDevice(device.deviceId)
    }
  }
  return registry.addDevice(name, scope, reach, [])
}
