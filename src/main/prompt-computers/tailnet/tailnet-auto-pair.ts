import { join } from 'node:path'
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { listEnvironments } from '../../../shared/runtime-environment-store'
import type { KnownRuntimeEnvironment } from '../../../shared/runtime-environments'
import { verifyAndAddRuntimeEnvironmentFromPairingCode } from '../../ipc/runtime-environments/runtime-environment-pairing-verification'
import type { TailnetPeer, TailscaleCli } from './tailscale-cli'
import {
  TAILNET_PAIR_PATH,
  TAILNET_PAIR_RESPONSE_VERSION,
  type TailnetPairResponse
} from './tailnet-pair-route'

/**
 * Prompt: fills the computer picker with the other computers on the same Tailscale account.
 * Every minute it reads `tailscale status`, asks each new computer's Prompt for a pairing link
 * (tailnet-pair-route.ts) and saves it the way "Add computer…" does.
 * A computer is added automatically once; if the user removes it, it stays removed.
 * Kept in a Prompt-only file so the daily upstream merge does not conflict.
 */

const POLL_INTERVAL_MS = 60_000
const FIRST_POLL_DELAY_MS = 5_000
const REQUEST_TIMEOUT_MS = 3_000
// A computer without Prompt running fails every poll; ask it again only after a while.
const RETRY_AFTER_FAILURE_MS = 10 * 60_000
// Packaged Prompt listens on 6768, a dev build on 6769.
const PROMPT_WS_PORTS = [6768, 6769] as const
// Phones only connect out; they never run a Prompt server to ask.
const CLIENT_ONLY_OS = new Set(['android', 'ios'])
const STATE_FILE = 'prompt-tailnet-auto-pair.json'

type AutoPairState = { added: string[] }

export type TailnetAutoPairDeps = {
  userDataPath: string
  tailscale: TailscaleCli
  ensureNetworkExposure: () => Promise<void>
  fetchPairing?: (url: string) => Promise<TailnetPairResponse | null>
  addEnvironment?: (args: { name: string; pairingCode: string }) => Promise<boolean>
  listSaved?: () => KnownRuntimeEnvironment[]
  now?: () => number
}

function readState(userDataPath: string): AutoPairState {
  try {
    const parsed = JSON.parse(readFileSync(join(userDataPath, STATE_FILE), 'utf8')) as unknown
    const added = (parsed as { added?: unknown }).added
    return { added: Array.isArray(added) ? added.filter((x) => typeof x === 'string') : [] }
  } catch {
    return { added: [] }
  }
}

function writeState(userDataPath: string, state: AutoPairState): void {
  const path = join(userDataPath, STATE_FILE)
  writeFileSync(`${path}.tmp`, JSON.stringify(state), 'utf8')
  renameSync(`${path}.tmp`, path)
}

function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).hostname.replace(/^\[|\]$/g, '').toLowerCase()
  } catch {
    return ''
  }
}

/** True when a saved computer already points at this peer by any of its Tailscale names. */
export function isPeerSaved(peer: TailnetPeer, saved: readonly KnownRuntimeEnvironment[]): boolean {
  const names = new Set(
    [...peer.addresses, peer.dnsName, peer.hostName].filter(Boolean).map((n) => n.toLowerCase())
  )
  return saved.some((environment) =>
    environment.endpoints.some((endpoint) => names.has(endpointHost(endpoint.endpoint)))
  )
}

/** Peers worth asking: same account, online, able to run a Prompt server, not added before. */
export function selectPeersToAsk(
  self: TailnetPeer,
  peers: readonly TailnetPeer[],
  alreadyAdded: ReadonlySet<string>,
  saved: readonly KnownRuntimeEnvironment[]
): TailnetPeer[] {
  return peers.filter(
    (peer) =>
      peer.userId === self.userId &&
      peer.online &&
      peer.stableId !== '' &&
      !CLIENT_ONLY_OS.has(peer.os.toLowerCase()) &&
      !alreadyAdded.has(peer.stableId) &&
      !isPeerSaved(peer, saved)
  )
}

/** Picks a name the store accepts: the computer's own name, then with its Tailscale name. */
export function uniqueComputerName(
  machineName: string,
  peer: TailnetPeer,
  saved: readonly KnownRuntimeEnvironment[]
): string {
  const taken = new Set(saved.map((environment) => environment.name.toLowerCase()))
  const base = machineName.trim() || peer.hostName
  if (!taken.has(base.toLowerCase())) {
    return base
  }
  const withHost = `${base} (${peer.hostName})`
  return taken.has(withHost.toLowerCase()) ? `${base} (${peer.stableId})` : withHost
}

async function fetchPairingOverHttp(url: string): Promise<TailnetPairResponse | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!response.ok) {
    return null
  }
  const body = (await response.json()) as Partial<TailnetPairResponse>
  return body.v === TAILNET_PAIR_RESPONSE_VERSION && typeof body.pairingCode === 'string'
    ? { v: body.v, pairingCode: body.pairingCode, machineName: String(body.machineName ?? '') }
    : null
}

function formatHost(address: string): string {
  return address.includes(':') ? `[${address}]` : address
}

export class TailnetAutoPair {
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private stopped = false
  private readonly failedAt = new Map<string, number>()
  private readonly deps: Required<TailnetAutoPairDeps>

  constructor(deps: TailnetAutoPairDeps) {
    this.deps = {
      fetchPairing: fetchPairingOverHttp,
      addEnvironment: async (args) =>
        (await verifyAndAddRuntimeEnvironmentFromPairingCode(deps.userDataPath, args)).ok,
      listSaved: () => listEnvironments(deps.userDataPath),
      now: Date.now,
      ...deps
    }
  }

  start(): void {
    this.schedule(FIRST_POLL_DELAY_MS)
  }

  stop(): void {
    this.stopped = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopped) {
      return
    }
    this.timer = setTimeout(() => {
      void this.pollOnce().finally(() => this.schedule(POLL_INTERVAL_MS))
    }, delayMs)
    this.timer.unref?.()
  }

  /** One pass; returns the names of computers added. Public for tests. */
  async pollOnce(): Promise<string[]> {
    if (this.running) {
      return []
    }
    this.running = true
    try {
      return await this.pollUnguarded()
    } catch (error) {
      console.warn('[prompt-tailnet] auto-pair pass failed:', error)
      return []
    } finally {
      this.running = false
    }
  }

  private async pollUnguarded(): Promise<string[]> {
    const status = await this.deps.tailscale.status()
    if (!status?.running || !status.self) {
      return []
    }
    // Other computers can only ask us once we listen beyond loopback.
    await this.deps.ensureNetworkExposure()

    const state = readState(this.deps.userDataPath)
    const added = new Set(state.added)
    const now = this.deps.now()
    const candidates = selectPeersToAsk(
      status.self,
      status.peers,
      added,
      this.deps.listSaved()
    ).filter(
      (peer) => now - (this.failedAt.get(peer.stableId) ?? -Infinity) >= RETRY_AFTER_FAILURE_MS
    )

    const addedNames: string[] = []
    for (const peer of candidates) {
      const name = await this.tryPeer(peer)
      if (name) {
        added.add(peer.stableId)
        addedNames.push(name)
        this.failedAt.delete(peer.stableId)
      } else {
        this.failedAt.set(peer.stableId, now)
      }
    }
    if (addedNames.length > 0) {
      writeState(this.deps.userDataPath, { added: [...added] })
    }
    return addedNames
  }

  private async tryPeer(peer: TailnetPeer): Promise<string | null> {
    const address = peer.addresses.find((a) => !a.includes(':')) ?? peer.addresses[0]
    if (!address) {
      return null
    }
    for (const port of PROMPT_WS_PORTS) {
      let pairing: TailnetPairResponse | null = null
      try {
        pairing = await this.deps.fetchPairing(
          `http://${formatHost(address)}:${port}${TAILNET_PAIR_PATH}`
        )
      } catch {
        pairing = null
      }
      if (!pairing) {
        continue
      }
      const name = uniqueComputerName(pairing.machineName, peer, this.deps.listSaved())
      if (await this.deps.addEnvironment({ name, pairingCode: pairing.pairingCode })) {
        console.info(`[prompt-tailnet] added ${name} (${peer.hostName})`)
        return name
      }
    }
    return null
  }
}
