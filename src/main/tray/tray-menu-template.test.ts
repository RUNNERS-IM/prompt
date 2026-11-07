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
    onNewWindow: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenHelp: vi.fn(),
    onQuit: vi.fn(),
    onQuitAndStopAllSessions: vi.fn(),
    ...overrides
  }
}

/** 줄 하나를 짧은 글로: 구분선은 '---'. */
function describeRow(row: PromptMenuRow): string {
  switch (row.kind) {
    case 'separator':
      return '---'
    case 'head':
      return row.sub ? `# ${row.name} / ${row.sub}` : `# ${row.name}`
    case 'info':
      return row.dot ? `● ${row.label}` : `(${row.label})`
    case 'command':
      return row.accelerator ? `${row.label} ${row.accelerator}` : row.label
  }
}

describe('tray menu rows', () => {
  it('lists open and new window, then settings and help, then the quit rows on macOS', () => {
    setPlatform('darwin')
    const rows = buildTrayMenuRows(options(), { devLabel: null, terminalCount: 2 })

    expect(rows.map(describeRow)).toEqual([
      '● 2 terminals running',
      '---',
      'Open Prompt',
      'New Window CmdOrCtrl+N',
      '---',
      'Settings…',
      'Help & Feedback',
      '---',
      'Quit Prompt CmdOrCtrl+Q',
      'Quit Completely...'
    ])
  })

  it('keeps the dev label first and drops lines whose handlers are missing', () => {
    setPlatform('darwin')
    const rows = buildTrayMenuRows(
      options({ onNewWindow: undefined, onQuitAndStopAllSessions: undefined }),
      { devLabel: 'Prompt DEV (menu-panel)', terminalCount: null }
    )

    expect(rows.map(describeRow)).toEqual([
      '(Prompt DEV (menu-panel))',
      '---',
      'Open Prompt',
      '---',
      'Settings…',
      'Help & Feedback',
      '---',
      'Quit Prompt CmdOrCtrl+Q'
    ])
  })

  it('keeps the Windows menu without settings or shortcut hints', () => {
    setPlatform('win32')
    const rows = buildTrayMenuRows(options(), { devLabel: null, terminalCount: null })

    expect(rows.map(describeRow)).toEqual([
      'Open Prompt',
      'New Window',
      '---',
      'Help & Feedback',
      '---',
      'Quit Prompt',
      'Quit Completely...'
    ])
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
      'New Window CmdOrCtrl+N'
    ])
  })
})

describe('tray menu template', () => {
  it('gives every native row its icon', () => {
    setPlatform('darwin')
    const template = buildTrayMenuTemplate(options(), {
      devLabel: null,
      terminalCount: null,
      wrap: (action) => action
    })

    expect(template.filter((item) => item.type !== 'separator').map((item) => item.icon)).toEqual([
      'icon:app-window',
      'icon:plus',
      'icon:settings',
      'icon:circle-help',
      'icon:square-x',
      'icon:circle-x'
    ])
  })

  it('runs every row through its own handler', () => {
    setPlatform('darwin')
    const opts = options()
    for (const [id, handler] of [
      ['open', opts.onOpen],
      ['newWindow', opts.onNewWindow],
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
