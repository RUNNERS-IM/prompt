import type { IncomingMessage, ServerResponse } from 'node:http'
import { isTailnetIPv4Address } from '../../../shared/tailnet-address'
import type { OrcaRuntimeRpcServer } from '../../runtime/runtime-rpc'
import type { TailscaleCli } from './tailscale-cli'

/**
 * Prompt: `GET /prompt/tailnet-pair` hands a pairing link to any device of this tailnet: person
 * accounts, tagged devices and phones alike; only devices shared in from another tailnet are
 * refused (decisions 2026-11-02). Prompt-only file to keep the upstream merge conflict-free.
 */

export const TAILNET_PAIR_PATH = '/prompt/tailnet-pair'
export const TAILNET_PAIR_RESPONSE_VERSION = 1

export type TailnetPairResponse = {
  v: typeof TAILNET_PAIR_RESPONSE_VERSION
  pairingCode: string
  machineName: string
}

export type TailnetPairServer = Pick<OrcaRuntimeRpcServer, 'createPairingOffer'>

export type TailnetPairRouteDeps = {
  server: TailnetPairServer
  tailscale: TailscaleCli
  readMachineName: () => string
  /** Widens the listener beyond loopback (no-op once widened); the link is useless otherwise. */
  ensureNetworkExposure: () => Promise<void>
}

// Each answer runs `tailscale status`; a misbehaving peer must not turn that into a flood.
const MIN_INTERVAL_PER_CALLER_MS = 5_000

/** IPv4-mapped IPv6 (`::ffff:100.x.y.z`) is how Node reports IPv4 callers on a dual-stack socket. */
export function normalizeRemoteAddress(address: string | undefined): string | null {
  if (!address) {
    return null
  }
  return address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address
}

/** Tailscale hands out 100.64.0.0/10 and fd7a:115c:a1e0::/48. Anything else never came over the tailnet. */
export function isTailnetAddress(address: string): boolean {
  return isTailnetIPv4Address(address) || address.toLowerCase().startsWith('fd7a:115c:a1e0:')
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

export type TailnetPairDecision =
  | { ok: true; callerName: string; scope: 'runtime' | 'mobile'; advertiseAddress: string }
  | { ok: false; status: number; reason: string }

/** The rule itself, kept free of HTTP so it can be tested on its own. */
export async function decideTailnetPair(
  callerAddress: string | null,
  requestedScope: string | null,
  tailscale: TailscaleCli
): Promise<TailnetPairDecision> {
  if (!callerAddress || !isTailnetAddress(callerAddress)) {
    return { ok: false, status: 403, reason: 'not_tailnet' }
  }
  const status = await tailscale.status()
  const self = status?.self
  if (!status?.running || !self) {
    return { ok: false, status: 503, reason: 'tailscale_unavailable' }
  }
  if (self.addresses.includes(callerAddress)) {
    return { ok: false, status: 403, reason: 'self' }
  }
  const caller = status.peers.find((peer) => peer.addresses.includes(callerAddress))
  if (!caller) {
    return { ok: false, status: 403, reason: 'unknown_caller' }
  }
  if (caller.sharedIn) {
    return { ok: false, status: 403, reason: 'shared_from_other_tailnet' }
  }
  const advertiseAddress = self.addresses.find(isTailnetIPv4Address) ?? self.addresses[0]
  if (!advertiseAddress) {
    return { ok: false, status: 503, reason: 'no_tailnet_address' }
  }
  return {
    ok: true,
    callerName: caller.hostName || callerAddress,
    scope: requestedScope === 'mobile' ? 'mobile' : 'runtime',
    advertiseAddress
  }
}

export function createTailnetPairRoute(
  deps: TailnetPairRouteDeps,
  now: () => number = Date.now
): (req: IncomingMessage, res: ServerResponse) => boolean {
  const lastAnsweredAt = new Map<string, number>()
  return (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== TAILNET_PAIR_PATH) {
      return false
    }
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'method_not_allowed' })
      return true
    }
    const callerAddress = normalizeRemoteAddress(req.socket.remoteAddress)
    const key = callerAddress ?? ''
    const previous = lastAnsweredAt.get(key)
    if (previous !== undefined && now() - previous < MIN_INTERVAL_PER_CALLER_MS) {
      sendJson(res, 429, { error: 'too_many_requests' })
      return true
    }
    lastAnsweredAt.set(key, now())
    void decideTailnetPair(callerAddress, url.searchParams.get('scope'), deps.tailscale)
      .then(async (decision) => {
        if (!decision.ok) {
          sendJson(res, decision.status, { error: decision.reason })
          return
        }
        await deps.ensureNetworkExposure()
        const offer = deps.server.createPairingOffer({
          address: decision.advertiseAddress,
          name: `Tailscale ${decision.callerName}`,
          scope: decision.scope,
          reach: 'network',
          replacePendingNamed: true
        })
        if (!offer.available) {
          sendJson(res, 503, { error: 'pairing_unavailable' })
          return
        }
        const body: TailnetPairResponse = {
          v: TAILNET_PAIR_RESPONSE_VERSION,
          pairingCode: offer.pairingUrl,
          machineName: deps.readMachineName()
        }
        sendJson(res, 200, body)
      })
      .catch((error: unknown) => {
        console.warn('[prompt-tailnet] pairing request failed:', error)
        if (!res.headersSent) {
          sendJson(res, 500, { error: 'internal' })
        }
      })
    return true
  }
}
