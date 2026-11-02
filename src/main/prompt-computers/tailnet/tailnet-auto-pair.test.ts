import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { KnownRuntimeEnvironment } from '../../../shared/runtime-environments'
import {
  findTailscaleBinary,
  parseTailscaleStatus,
  parseTailscaleWhois,
  type TailnetPeer,
  type TailscaleCli
} from './tailscale-cli'
import { decideTailnetPair, normalizeRemoteAddress } from './tailnet-pair-route'
import {
  isPeerSaved,
  selectPeersToAsk,
  TailnetAutoPair,
  uniqueComputerName
} from './tailnet-auto-pair'

const ME = 7

function peer(over: Partial<TailnetPeer> = {}): TailnetPeer {
  return {
    stableId: 'n-m2pro1',
    hostName: 'm2-pro-1',
    dnsName: 'm2-pro-1.tail.ts.net',
    os: 'macOS',
    userId: ME,
    online: true,
    addresses: ['100.120.207.29', 'fd7a:115c:a1e0::1'],
    ...over
  }
}

const self = peer({ stableId: 'n-self', hostName: 'm1-pro-2', addresses: ['100.77.74.104'] })

function saved(endpoint: string, name = 'Saved'): KnownRuntimeEnvironment {
  return {
    id: name,
    name,
    createdAt: 0,
    updatedAt: 0,
    lastUsedAt: null,
    runtimeId: null,
    endpoints: [
      { id: 'e', kind: 'websocket', label: 'x', endpoint, deviceToken: 't', publicKeyB64: 'k' }
    ],
    preferredEndpointId: 'e'
  }
}

function cli(over: Partial<TailscaleCli> = {}): TailscaleCli {
  return {
    status: async () => ({ running: true, self, peers: [peer()] }),
    whois: async () => ({ userId: ME, hostName: 'm2-pro-1', os: 'macOS' }),
    ...over
  }
}

describe('tailscale-cli parsing', () => {
  it('reads self, peers and backend state from status --json', () => {
    const status = parseTailscaleStatus(
      JSON.stringify({
        BackendState: 'Running',
        Self: {
          ID: 's',
          HostName: 'me',
          DNSName: 'me.ts.net.',
          OS: 'macOS',
          UserID: 1,
          Online: true,
          TailscaleIPs: ['100.64.0.1']
        },
        Peer: {
          k: {
            ID: 'p',
            HostName: 'phone',
            OS: 'android',
            UserID: 1,
            Online: false,
            TailscaleIPs: ['100.64.0.2']
          }
        }
      })
    )
    expect(status?.running).toBe(true)
    expect(status?.self?.dnsName).toBe('me.ts.net')
    expect(status?.peers).toHaveLength(1)
    expect(status?.peers[0]?.os).toBe('android')
  })

  it('returns null for output it does not understand', () => {
    expect(parseTailscaleStatus('not json')).toBeNull()
    expect(parseTailscaleWhois('{}')).toBeNull()
  })

  it('reads the owner and device of a whois answer', () => {
    expect(
      parseTailscaleWhois(
        JSON.stringify({
          Node: { User: 3, Hostinfo: { Hostname: 'pc', OS: 'windows' } },
          UserProfile: { ID: 3 }
        })
      )
    ).toEqual({ userId: 3, hostName: 'pc', os: 'windows' })
  })

  it('finds the binary only where it exists', () => {
    expect(findTailscaleBinary('darwin', (p) => p.startsWith('/Applications'))).toContain(
      'Tailscale.app'
    )
    expect(findTailscaleBinary('darwin', () => false)).toBeNull()
  })
})

describe('decideTailnetPair', () => {
  it('accepts a computer on the same account and advertises our IPv4', async () => {
    const decision = await decideTailnetPair('100.120.207.29', null, cli())
    expect(decision).toEqual({
      ok: true,
      callerName: 'm2-pro-1',
      scope: 'runtime',
      advertiseAddress: '100.77.74.104'
    })
  })

  it('accepts a phone on the same account with a mobile link (decision 2026-11-02, choice 2)', async () => {
    const tailscale = cli({ whois: async () => ({ userId: ME, hostName: 's24', os: 'android' }) })
    const decision = await decideTailnetPair('100.89.183.122', 'mobile', tailscale)
    expect(decision).toMatchObject({ ok: true, scope: 'mobile' })
  })

  it('refuses callers outside the tailnet range', async () => {
    expect(await decideTailnetPair('192.168.0.10', null, cli())).toMatchObject({
      ok: false,
      reason: 'not_tailnet'
    })
    expect(await decideTailnetPair(null, null, cli())).toMatchObject({ ok: false })
  })

  it('refuses another Tailscale account', async () => {
    const tailscale = cli({ whois: async () => ({ userId: 99, hostName: 'x', os: 'macOS' }) })
    expect(await decideTailnetPair('100.120.207.29', null, tailscale)).toMatchObject({
      ok: false,
      reason: 'other_account'
    })
  })

  it('refuses when Tailscale is not running or cannot name the caller', async () => {
    expect(
      await decideTailnetPair('100.120.207.29', null, cli({ status: async () => null }))
    ).toMatchObject({ ok: false, reason: 'tailscale_unavailable' })
    expect(
      await decideTailnetPair('100.120.207.29', null, cli({ whois: async () => null }))
    ).toMatchObject({ ok: false, reason: 'unknown_caller' })
  })

  it('unwraps IPv4-mapped addresses', () => {
    expect(normalizeRemoteAddress('::ffff:100.64.1.2')).toBe('100.64.1.2')
  })
})

describe('peer selection', () => {
  it('skips other accounts, offline peers, phones, added and saved computers', () => {
    const peers = [
      peer(),
      peer({ stableId: 'other', userId: 99 }),
      peer({ stableId: 'off', online: false }),
      peer({ stableId: 'phone', os: 'android' }),
      peer({ stableId: 'done' }),
      peer({ stableId: 'saved', hostName: 'm2-pro-2', addresses: ['100.79.89.7'], dnsName: '' })
    ]
    const picked = selectPeersToAsk(self, peers, new Set(['done']), [
      saved('ws://100.79.89.7:6768')
    ])
    expect(picked.map((p) => p.stableId)).toEqual(['n-m2pro1'])
  })

  it('recognises a saved computer by its MagicDNS name', () => {
    expect(isPeerSaved(peer(), [saved('ws://m2-pro-1.tail.ts.net:6768')])).toBe(true)
  })

  it('keeps names unique', () => {
    expect(uniqueComputerName('Mac', peer(), [])).toBe('Mac')
    expect(uniqueComputerName('Mac', peer(), [saved('ws://a:1', 'Mac')])).toBe('Mac (m2-pro-1)')
  })
})

describe('TailnetAutoPair', () => {
  it('adds a new computer once and remembers it', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'tailnet-auto-pair-'))
    const addEnvironment = vi.fn(async () => true)
    const fetchPairing = vi.fn(async (url: string) =>
      url.includes(':6768')
        ? { v: 1 as const, pairingCode: 'prompt://pair?code=x', machineName: 'MacBook Pro' }
        : null
    )
    const ensureNetworkExposure = vi.fn(async () => {})
    const service = new TailnetAutoPair({
      userDataPath,
      tailscale: cli(),
      ensureNetworkExposure,
      fetchPairing,
      addEnvironment,
      listSaved: () => []
    })
    expect(await service.pollOnce()).toEqual(['MacBook Pro'])
    expect(fetchPairing).toHaveBeenCalledWith('http://100.120.207.29:6768/prompt/tailnet-pair')
    expect(addEnvironment).toHaveBeenCalledWith({
      name: 'MacBook Pro',
      pairingCode: 'prompt://pair?code=x'
    })
    expect(ensureNetworkExposure).toHaveBeenCalled()
    expect(
      JSON.parse(readFileSync(join(userDataPath, 'prompt-tailnet-auto-pair.json'), 'utf8'))
    ).toEqual({
      added: ['n-m2pro1']
    })
    // Removed by the user later: it must not come back on the next pass.
    expect(await service.pollOnce()).toEqual([])
    expect(addEnvironment).toHaveBeenCalledTimes(1)
  })

  it('waits before asking a computer again after it did not answer', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'tailnet-auto-pair-'))
    let now = 0
    const fetchPairing = vi.fn(async () => null)
    const service = new TailnetAutoPair({
      userDataPath,
      tailscale: cli(),
      ensureNetworkExposure: async () => {},
      fetchPairing,
      addEnvironment: async () => true,
      listSaved: () => [],
      now: () => now
    })
    await service.pollOnce()
    expect(fetchPairing).toHaveBeenCalledTimes(2)
    now = 60_000
    await service.pollOnce()
    expect(fetchPairing).toHaveBeenCalledTimes(2)
    now = 11 * 60_000
    await service.pollOnce()
    expect(fetchPairing).toHaveBeenCalledTimes(4)
  })

  it('does nothing while Tailscale is off', async () => {
    const ensureNetworkExposure = vi.fn(async () => {})
    const service = new TailnetAutoPair({
      userDataPath: mkdtempSync(join(tmpdir(), 'tailnet-auto-pair-')),
      tailscale: cli({ status: async () => null }),
      ensureNetworkExposure
    })
    expect(await service.pollOnce()).toEqual([])
    expect(ensureNetworkExposure).not.toHaveBeenCalled()
  })
})

describe('replacePendingDeviceNamed', () => {
  it("replaces only that caller's unused link", async () => {
    const { DeviceRegistry } = await import('../../runtime/device-registry')
    const { replacePendingDeviceNamed } = await import('./replace-pending-device')
    const registry = new DeviceRegistry(mkdtempSync(join(tmpdir(), 'tailnet-registry-')))
    const shared = registry.getOrCreatePendingDevice('Share dialog', 'runtime', 'network')
    const first = replacePendingDeviceNamed(registry, 'Tailscale m2-pro-1', 'runtime', 'network')
    const second = replacePendingDeviceNamed(registry, 'Tailscale m2-pro-1', 'runtime', 'network')
    const other = replacePendingDeviceNamed(registry, 'Tailscale m3-pro-1', 'runtime', 'network')
    const ids = registry.listDevices().map((d) => d.deviceId)
    expect(ids).toContain(shared.deviceId)
    expect(ids).not.toContain(first.deviceId)
    expect(ids).toContain(second.deviceId)
    expect(ids).toContain(other.deviceId)
    expect(second.token).not.toBe(first.token)
  })
})
