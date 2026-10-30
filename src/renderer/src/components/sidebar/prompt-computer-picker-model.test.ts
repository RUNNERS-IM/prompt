import { describe, expect, it } from 'vitest'
import type { SidebarHostOption } from './sidebar-host-options'
import {
  buildPromptComputerRows,
  fallbackPromptComputer,
  isPromptComputerHost,
  newlyAddedRuntimeHostId,
  promptComputerStatus,
  promptComputerVisibleHostIds,
  resolvePromptSelectedComputer
} from './prompt-computer-picker-model'

function host(
  id: SidebarHostOption['id'],
  label: string,
  health: SidebarHostOption['health'],
  extra: Partial<SidebarHostOption> = {}
): SidebarHostOption {
  return {
    id,
    label,
    detail: '',
    kind: id === 'local' ? 'local' : id.startsWith('ssh:') ? 'ssh' : 'runtime',
    health,
    presence: id === 'local' ? 'local' : 'project',
    ...extra
  }
}

const HOSTS: SidebarHostOption[] = [
  host('runtime:env-2', 'm1-max-1', 'disconnected'),
  host('local', 'macOS', 'local'),
  host('runtime:env-1', 'm2-pro-2', 'available')
]

describe('buildPromptComputerRows', () => {
  it('puts this computer first under its machine name', () => {
    expect(buildPromptComputerRows(HOSTS, 'm2-pro-1')).toEqual([
      { id: 'local', label: 'm2-pro-1', isLocal: true, status: 'connected' },
      {
        id: 'runtime:env-2',
        label: 'm1-max-1',
        isLocal: false,
        status: 'offline'
      },
      {
        id: 'runtime:env-1',
        label: 'm2-pro-2',
        isLocal: false,
        status: 'connected'
      }
    ])
  })

  it('hides a merged-away twin so each machine is listed once', () => {
    const rows = buildPromptComputerRows(
      [
        host('local', 'macOS', 'local'),
        host('ssh:box', 'box', 'available', {
          aliasHostIds: ['runtime:box-orcad']
        }),
        host('runtime:box-orcad', 'box', 'available', {
          mergedIntoHostId: 'ssh:box'
        })
      ],
      'm2-pro-1'
    )
    expect(rows.map((row) => row.id)).toEqual(['local', 'ssh:box'])
  })

  it('leaves out plain SSH hosts from ~/.ssh/config', () => {
    const rows = buildPromptComputerRows(
      [
        host('local', 'macOS', 'local'),
        host('ssh:github.com', 'github.com', 'disconnected'),
        host('ssh:macbook-pro-3', 'macbook-pro-3', 'available'),
        host('runtime:env-1', 'm2-pro-2', 'available'),
        host('ssh:macbook-pro-3-dup', 'macbook-pro-3', 'disconnected')
      ],
      'm2-pro-1'
    )
    expect(rows.map((row) => row.id)).toEqual(['local', 'runtime:env-1'])
  })

  it('lists only this computer when nothing is paired', () => {
    const rows = buildPromptComputerRows(
      [host('ssh:github.com', 'github.com', 'disconnected')],
      'm2-pro-1'
    )
    expect(rows.map((row) => row.id)).toEqual(['local'])
  })
})

describe('isPromptComputerHost', () => {
  it('accepts this computer, runtimes and an SSH row that stands for a runtime', () => {
    expect(isPromptComputerHost(host('local', 'macOS', 'local'))).toBe(true)
    expect(isPromptComputerHost(host('runtime:env-1', 'm2-pro-2', 'available'))).toBe(true)
    expect(
      isPromptComputerHost(
        host('ssh:box', 'box', 'available', { aliasHostIds: ['runtime:box-orcad'] })
      )
    ).toBe(true)
    expect(isPromptComputerHost(host('ssh:github.com', 'github.com', 'available'))).toBe(false)
  })
})

describe('promptComputerStatus', () => {
  it('maps host health to a dot', () => {
    expect(promptComputerStatus('local')).toBe('connected')
    expect(promptComputerStatus('available')).toBe('connected')
    expect(promptComputerStatus('connecting')).toBe('connecting')
    expect(promptComputerStatus('blocked')).toBe('offline')
    expect(promptComputerStatus('error')).toBe('offline')
  })
})

describe('resolvePromptSelectedComputer', () => {
  const base = { hostOptions: HOSTS, runtimeCatalogHydrated: true }

  it('needs exactly one computer in the filter', () => {
    expect(resolvePromptSelectedComputer({ ...base, visibleHostIds: null })).toBeNull()
    expect(
      resolvePromptSelectedComputer({
        ...base,
        visibleHostIds: ['local', 'runtime:env-1']
      })
    ).toBeNull()
    expect(
      resolvePromptSelectedComputer({
        ...base,
        visibleHostIds: ['runtime:env-1']
      })
    ).toBe('runtime:env-1')
  })

  it('treats both ids of a merged machine as one choice', () => {
    const hostOptions = [
      host('local', 'macOS', 'local'),
      host('ssh:box', 'box', 'available', {
        aliasHostIds: ['runtime:box-orcad']
      }),
      host('runtime:box-orcad', 'box', 'available', {
        mergedIntoHostId: 'ssh:box'
      })
    ]
    expect(
      resolvePromptSelectedComputer({
        hostOptions,
        runtimeCatalogHydrated: true,
        visibleHostIds: ['ssh:box', 'runtime:box-orcad']
      })
    ).toBe('ssh:box')
  })

  it('keeps a saved remote choice until the paired list has loaded', () => {
    const saved = {
      visibleHostIds: ['runtime:gone'] as const,
      hostOptions: HOSTS
    }
    expect(
      resolvePromptSelectedComputer({
        ...saved,
        visibleHostIds: [...saved.visibleHostIds],
        runtimeCatalogHydrated: false
      })
    ).toBe('runtime:gone')
    expect(
      resolvePromptSelectedComputer({
        ...saved,
        visibleHostIds: [...saved.visibleHostIds],
        runtimeCatalogHydrated: true
      })
    ).toBeNull()
  })

  it('drops a saved plain SSH host once the paired list has loaded', () => {
    const hostOptions = [...HOSTS, host('ssh:macbook-pro-3', 'macbook-pro-3', 'available')]
    expect(
      resolvePromptSelectedComputer({
        hostOptions,
        visibleHostIds: ['ssh:macbook-pro-3'],
        runtimeCatalogHydrated: false
      })
    ).toBe('ssh:macbook-pro-3')
    expect(
      resolvePromptSelectedComputer({
        hostOptions,
        visibleHostIds: ['ssh:macbook-pro-3'],
        runtimeCatalogHydrated: true
      })
    ).toBeNull()
    expect(
      fallbackPromptComputer(['ssh:macbook-pro-3'], buildPromptComputerRows(hostOptions, 'm'))
    ).toBe('local')
  })
})

describe('picking', () => {
  it('stores every id that stands for the picked machine', () => {
    const hostOptions = [
      host('ssh:box', 'box', 'available', {
        aliasHostIds: ['runtime:box-orcad']
      }),
      host('runtime:box-orcad', 'box', 'available', {
        mergedIntoHostId: 'ssh:box'
      })
    ]
    expect(promptComputerVisibleHostIds(hostOptions, 'ssh:box').sort()).toEqual([
      'runtime:box-orcad',
      'ssh:box'
    ])
    expect(promptComputerVisibleHostIds(HOSTS, 'local')).toEqual(['local'])
  })

  it('narrows "all hosts" to this computer and a multi-host filter to its first known host', () => {
    const rows = buildPromptComputerRows(HOSTS, 'm2-pro-1')
    expect(fallbackPromptComputer(null, rows)).toBe('local')
    expect(fallbackPromptComputer(['runtime:unknown', 'runtime:env-1', 'local'], rows)).toBe(
      'runtime:env-1'
    )
  })

  it('finds the computer that was just paired', () => {
    expect(newlyAddedRuntimeHostId(new Set(['env-1']), [{ id: 'env-1' }, { id: 'env 3' }])).toBe(
      'runtime:env%203'
    )
    expect(newlyAddedRuntimeHostId(new Set(['env-1']), [{ id: 'env-1' }])).toBeNull()
  })
})
