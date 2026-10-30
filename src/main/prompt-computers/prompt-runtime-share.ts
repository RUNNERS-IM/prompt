import { classifyRemotePairingHostname } from '../../shared/remote-pairing-address'
import { resolveAdvertisedPairingHostname } from '../runtime/pairing-endpoint'
import type { OrcaRuntimeRpcServer } from '../runtime/runtime-rpc'
import { NETWORK_EXPOSURE_FAILED_GUIDANCE } from '../runtime/network-exposure-guidance'

/**
 * Prompt: `orca environment share --address <host>` asks the running app for a runtime pairing
 * link, so another Mac can be paired over SSH without clicking through the share dialog.
 * Kept in a Prompt-only file so the daily upstream merge does not conflict.
 */

export type PromptRuntimeShareServer = Pick<
  OrcaRuntimeRpcServer,
  'ensureNetworkExposure' | 'createPairingOffer'
>

export type PromptRuntimeShareResult = {
  pairingUrl: string
  endpoint: string
  deviceId: string
}

export class PromptRuntimeShareError extends Error {
  constructor(
    readonly code: 'invalid_address' | 'share_unavailable',
    message: string
  ) {
    super(message)
  }
}

let shareServer: PromptRuntimeShareServer | null = null

/** Called once the runtime RPC server exists; the share RPC method reads it from here. */
export function setPromptRuntimeShareServer(server: PromptRuntimeShareServer | null): void {
  shareServer = server
}

export function getPromptRuntimeShareServer(): PromptRuntimeShareServer | null {
  return shareServer
}

/** A host name or IP, optionally with :port. Full URLs and loopback are refused. */
export function validatePromptShareAddress(raw: string): string {
  const address = raw.trim()
  if (!address || address.includes('://') || /\s/.test(address)) {
    throw new PromptRuntimeShareError(
      'invalid_address',
      'Pass the name or IP other computers use to reach this one, e.g. --address m2-pro-1.'
    )
  }
  const hostname = resolveAdvertisedPairingHostname(address)
  if (!hostname) {
    throw new PromptRuntimeShareError('invalid_address', `Not a valid host name: ${address}`)
  }
  if (classifyRemotePairingHostname(hostname) === 'loopback') {
    throw new PromptRuntimeShareError(
      'invalid_address',
      'A loopback address only works on this computer. Pass the name other computers use.'
    )
  }
  return address
}

/** Opens the runtime to the network (as the share dialog does) and mints a runtime-scope link. */
export async function createPromptRuntimeShareOffer(
  server: PromptRuntimeShareServer,
  rawAddress: string,
  now: Date = new Date()
): Promise<PromptRuntimeShareResult> {
  const address = validatePromptShareAddress(rawAddress)
  try {
    await server.ensureNetworkExposure()
  } catch {
    throw new PromptRuntimeShareError('share_unavailable', NETWORK_EXPOSURE_FAILED_GUIDANCE)
  }
  // Reuse a link nobody has used yet, so running the command twice prints the same link.
  const offer = server.createPairingOffer({
    address,
    name: `Runtime ${now.toLocaleDateString()}`,
    scope: 'runtime',
    reach: 'network'
  })
  if (!offer.available) {
    throw new PromptRuntimeShareError('share_unavailable', offer.guidance)
  }
  return {
    pairingUrl: offer.pairingUrl,
    endpoint: offer.endpoint,
    deviceId: offer.deviceId
  }
}
