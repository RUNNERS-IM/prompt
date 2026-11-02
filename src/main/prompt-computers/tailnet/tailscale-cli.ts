import { runProcess } from '@orca/process-host'
import { existsSync } from 'node:fs'

/**
 * Prompt: reads this computer's Tailscale state through the `tailscale` command line.
 * Prompt uses it to find the other computers of this tailnet
 * and to check that a caller belongs to this tailnet before it hands out a pairing link.
 * Kept in a Prompt-only file so the daily upstream merge does not conflict.
 */

const TAILSCALE_COMMAND_TIMEOUT_MS = 5_000
const TAILSCALE_OUTPUT_MAX_BYTES = 4 * 1024 * 1024

// The GUI installs put the binary in different places; PATH is not reliable for a GUI app on macOS.
const CANDIDATE_PATHS: Record<string, readonly string[]> = {
  darwin: [
    '/opt/homebrew/bin/tailscale',
    '/usr/local/bin/tailscale',
    '/Applications/Tailscale.app/Contents/MacOS/Tailscale'
  ],
  linux: ['/usr/bin/tailscale', '/usr/sbin/tailscale', '/usr/local/bin/tailscale'],
  win32: ['C:\\Program Files\\Tailscale\\tailscale.exe']
}

export type TailnetPeer = {
  stableId: string
  hostName: string
  dnsName: string
  os: string
  online: boolean
  /** Shared in from another tailnet; not one of ours. */
  sharedIn: boolean
  addresses: string[]
}

export type TailnetStatus = {
  running: boolean
  self: TailnetPeer | null
  peers: TailnetPeer[]
}

export type TailscaleCli = {
  status(): Promise<TailnetStatus | null>
}

type RunTailscale = (binary: string, args: string[]) => Promise<string>

const runTailscaleCommand: RunTailscale = async (binary, args) => {
  const result = await runProcess({
    program: binary,
    args,
    timeoutMs: TAILSCALE_COMMAND_TIMEOUT_MS,
    maxOutputBytes: TAILSCALE_OUTPUT_MAX_BYTES,
    killOnOutputLimit: true
  })
  if (result.code !== 0 || result.timedOut || result.outputTruncated) {
    throw new Error(`tailscale ${args[0]} failed`)
  }
  return result.stdout
}

export function findTailscaleBinary(
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync
): string | null {
  return (CANDIDATE_PATHS[platform] ?? []).find((path) => exists(path)) ?? null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parsePeer(raw: unknown): TailnetPeer | null {
  const node = asRecord(raw)
  if (!node || !Array.isArray(node.TailscaleIPs)) {
    return null
  }
  const addresses = node.TailscaleIPs.filter((ip): ip is string => typeof ip === 'string')
  return {
    stableId: typeof node.ID === 'string' ? node.ID : '',
    hostName: typeof node.HostName === 'string' ? node.HostName : '',
    dnsName: typeof node.DNSName === 'string' ? node.DNSName.replace(/\.$/, '') : '',
    os: typeof node.OS === 'string' ? node.OS : '',
    online: node.Online === true,
    sharedIn: node.ShareeNode === true,
    addresses
  }
}

/** Parses `tailscale status --json`. Unknown shapes yield null rather than a guess. */
export function parseTailscaleStatus(json: string): TailnetStatus | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  const root = asRecord(parsed)
  if (!root) {
    return null
  }
  const self = parsePeer(root.Self)
  const peerMap = asRecord(root.Peer) ?? {}
  const peers = Object.values(peerMap)
    .map(parsePeer)
    .filter((peer): peer is TailnetPeer => peer !== null)
  return { running: root.BackendState === 'Running', self, peers }
}

export function createTailscaleCli(
  options: { binary?: string | null; run?: RunTailscale } = {}
): TailscaleCli {
  const run = options.run ?? runTailscaleCommand
  const binary = (): string | null =>
    options.binary === undefined ? findTailscaleBinary() : options.binary
  return {
    async status() {
      const path = binary()
      if (!path) {
        return null
      }
      try {
        return parseTailscaleStatus(await run(path, ['status', '--json']))
      } catch {
        return null
      }
    }
  }
}
