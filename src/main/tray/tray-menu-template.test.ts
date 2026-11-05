import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PromptMenuRow } from '../../shared/prompt-menu-panel'

vi.mock('electron', () => ({}))
vi.mock('./tray-menu-icons', () => ({
  trayMenuIcon: (name: string) => (process.platform === 'darwin' ? `icon:${name}` : undefined)
}))

const { buildTrayMenuRows, buildTrayMenuTemplate, buildTrayPanelRows, runTrayMenuCommand } =
  await import('./tray-menu-template')

const originalPlatform = process.platform

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

afterEach(() => {
  setPlatform(originalPlatform)
})

function options(overrides: Record<string, unknown> = {}) {
  return {
    appIcon: 'classic',
    isDevInstance: false,
    devInstanceLabel: null,
    onOpen: vi.fn(),
    onOpenSettings: vi.fn(),
    onCheckForUpdates: vi.fn(),
    onShowAbout: vi.fn(),
    onOpenHelp: vi.fn(),
    onQuit: vi.fn(),
    onQuitAndStopAllSessions: vi.fn(),
    getOpenAtLogin: () => true,
    onToggleOpenAtLogin: vi.fn(),
    getAutoCheckUpdates: () => false,
    onToggleAutoCheckUpdates: vi.fn(),
    ...overrides
  }
}

/** 줄 하나를 짧은 글로: 구분선은 '---', 켬/끔은 [x]/[ ]. */
function describeRow(row: PromptMenuRow): string {
  switch (row.kind) {
    case 'separator':
      return '---'
    case 'head':
      return row.sub ? `# ${row.name} / ${row.sub}` : `# ${row.name}`
    case 'info':
      return row.dot ? `● ${row.label}` : `(${row.label})`
    case 'toggle':
      return `${row.checked ? '[x]' : '[ ]'} ${row.label}`
    case 'command':
      return row.accelerator ? `${row.label} ${row.accelerator}` : row.label
  }
}

describe('tray menu rows', () => {
  it('puts the two on/off rows right above the info group on macOS', () => {
    setPlatform('darwin')
    const rows = buildTrayMenuRows(options(), { devLabel: null, terminalCount: 2 })

    expect(rows.map(describeRow)).toEqual([
      '● 2 terminals running',
      '---',
      'Open Prompt',
      '---',
      '[x] Open at Login',
      '[ ] Check for Updates Automatically',
      '---',
      'About Prompt',
      'Check for Updates…',
      'Settings…',
      'Help & Feedback',
      '---',
      'Quit Prompt CmdOrCtrl+Q',
      'Quit Completely...'
    ])
    expect(rows.filter((row) => row.kind === 'toggle').map((row) => row.icon)).toEqual([
      'power',
      'refresh-cw'
    ])
  })

  it('keeps the dev label first and drops lines whose handlers are missing', () => {
    setPlatform('darwin')
    const rows = buildTrayMenuRows(
      options({
        getOpenAtLogin: undefined,
        getAutoCheckUpdates: undefined,
        onQuitAndStopAllSessions: undefined
      }),
      { devLabel: 'Prompt DEV (menu-panel)', terminalCount: null }
    )

    expect(rows.map(describeRow)).toEqual([
      '(Prompt DEV (menu-panel))',
      '---',
      'Open Prompt',
      '---',
      'About Prompt',
      'Check for Updates…',
      'Settings…',
      'Help & Feedback',
      '---',
      'Quit Prompt CmdOrCtrl+Q'
    ])
  })

  it('keeps the short Windows menu and adds only the two check rows', () => {
    setPlatform('win32')
    const rows = buildTrayMenuRows(options(), { devLabel: null, terminalCount: null })

    expect(rows.map(describeRow)).toEqual([
      'Open Prompt',
      '---',
      '[x] Open at Login',
      '[ ] Check for Updates Automatically',
      '---',
      'About Prompt',
      'Help & Feedback',
      '---',
      'Quit Prompt',
      'Quit Completely...'
    ])
  })

  it('reads a throwing on/off state as off instead of failing the menu', () => {
    setPlatform('darwin')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const rows = buildTrayMenuRows(
      options({
        getOpenAtLogin: () => {
          throw new Error('no login item')
        }
      }),
      { devLabel: null, terminalCount: null }
    )

    expect(rows.find((row) => row.kind === 'toggle' && row.id === 'openAtLogin')).toMatchObject({
      checked: false
    })
  })
})

describe('tray panel rows', () => {
  it('folds the dev label and terminal count into one head line', () => {
    setPlatform('darwin')
    const rows = buildTrayPanelRows(options(), { devLabel: 'Prompt DEV (x)', terminalCount: 3 })

    expect(rows.slice(0, 4).map(describeRow)).toEqual([
      '# Prompt DEV / 3 terminals running',
      '---',
      'Open Prompt',
      '---'
    ])
  })
})

describe('tray menu template', () => {
  it('turns the on/off rows into native check items without icons', () => {
    setPlatform('darwin')
    const template = buildTrayMenuTemplate(options(), {
      devLabel: null,
      terminalCount: null,
      wrap: (action) => action
    })

    const checks = template.filter((item) => item.type === 'checkbox')
    expect(checks.map((item) => [item.label, item.checked, item.icon])).toEqual([
      ['Open at Login', true, undefined],
      ['Check for Updates Automatically', false, undefined]
    ])
  })

  it('runs every row through its own handler', () => {
    setPlatform('darwin')
    const opts = options()
    for (const [id, handler] of [
      ['open', opts.onOpen],
      ['openAtLogin', opts.onToggleOpenAtLogin],
      ['autoCheckUpdates', opts.onToggleAutoCheckUpdates],
      ['about', opts.onShowAbout],
      ['checkForUpdates', opts.onCheckForUpdates],
      ['settings', opts.onOpenSettings],
      ['help', opts.onOpenHelp],
      ['quit', opts.onQuit],
      ['quitCompletely', opts.onQuitAndStopAllSessions]
    ] as const) {
      runTrayMenuCommand(opts, id)
      expect(handler).toHaveBeenCalledOnce()
    }
  })
})
