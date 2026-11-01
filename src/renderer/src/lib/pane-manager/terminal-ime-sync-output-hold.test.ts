// @vitest-environment happy-dom
import { Terminal } from '@xterm/xterm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTerminalImeSyncOutputHold } from './terminal-ime-sync-output-hold'

const CELL_WIDTH_PX = 8
const CELL_HEIGHT_PX = 16
// Earlier output on rows 0..3 and the input prompt on row 5, cursor at its end (x=2).
const SCREEN = '첫째 줄 이전 문장 꼬리입니다\r\n둘째 줄\r\n셋째 줄\r\n넷째 줄\r\n\r\n> '
const PROMPT_TOP = `${5 * CELL_HEIGHT_PX}px`

const openTerminals: Terminal[] = []

function nextEventLoop(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}

function openTerminal(): {
  terminal: Terminal
  view: HTMLElement
  write: (data: string) => Promise<void>
  writeAwaitingRender: (data: string) => Promise<void>
  compose: (preedit: string) => void
} {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const terminal = new Terminal({ cols: 80, rows: 24 })
  terminal.open(container)
  openTerminals.push(terminal)
  const view = container.querySelector<HTMLElement>('.composition-view')
  const textarea = terminal.textarea
  if (!view || !textarea) {
    throw new Error('xterm did not create the helper textarea and composition view')
  }
  const cell = (
    terminal as unknown as {
      _core: {
        _renderService: { dimensions: { css: { cell: { height: number; width: number } } } }
      }
    }
  )._core._renderService.dimensions.css.cell
  cell.width = CELL_WIDTH_PX
  cell.height = CELL_HEIGHT_PX

  const write = (data: string): Promise<void> =>
    new Promise((resolve) => terminal.write(data, resolve))
  const writeAwaitingRender = async (data: string): Promise<void> => {
    await write(data)
    await new Promise<void>((resolve) => {
      const rendered = terminal.onRender(() => {
        rendered.dispose()
        resolve()
      })
    })
  }
  const compose = (preedit: string): void => {
    const start = new CompositionEvent('compositionstart', { bubbles: true })
    Object.defineProperty(start, 'data', { value: '' })
    textarea.dispatchEvent(start)
    const update = new CompositionEvent('compositionupdate', { bubbles: true })
    Object.defineProperty(update, 'data', { value: preedit })
    textarea.value = preedit
    textarea.dispatchEvent(update)
  }
  return { terminal, view, write, writeAwaitingRender, compose }
}

describe('installTerminalImeSyncOutputHold', () => {
  beforeEach(() => {
    // happy-dom has no 2d context, which the DOM renderer's WidthCache requires.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      measureText: () => ({ width: 10 })
    } as unknown as CanvasRenderingContext2D)
  })

  afterEach(async () => {
    await nextEventLoop()
    await nextEventLoop()
    while (openTerminals.length > 0) {
      openTerminals.pop()?.dispose()
    }
    vi.restoreAllMocks()
    document.body.replaceChildren()
  })

  it('without the hold, the overlay jumps to the row a sync frame is rewriting (the bug)', async () => {
    const rig = openTerminal()
    await rig.write(SCREEN)
    rig.compose('ㄱ')

    await rig.write('\x1b[?2026h\x1b[5A\x1b[3G')
    await nextEventLoop()

    expect(rig.view.style.top).toBe('0px')
    expect(rig.view.textContent).toContain('이전 문장 꼬리')
  })

  it('hides the overlay while a sync frame is open and shows it back on the prompt row', async () => {
    const rig = openTerminal()
    expect(installTerminalImeSyncOutputHold(rig.terminal)).not.toBeNull()
    await rig.write(SCREEN)
    rig.compose('ㄱ')
    expect(rig.view.style.visibility).toBe('')

    await rig.write('\x1b[?2026h\x1b[5A\x1b[3G')
    await nextEventLoop()
    expect(rig.view.style.visibility).toBe('hidden')

    await rig.writeAwaitingRender('\x1b[5B\x1b[3G\x1b[?2026l')
    expect(rig.view.style.visibility).toBe('')
    expect(rig.view.style.top).toBe(PROMPT_TOP)
  })

  it('never hides the overlay for output outside a sync frame', async () => {
    const rig = openTerminal()
    installTerminalImeSyncOutputHold(rig.terminal)
    await rig.write(SCREEN)
    rig.compose('ㄱ')

    await rig.writeAwaitingRender('\x1b[?2026h\x1b[5A\x1b[3G\x1b[5B\x1b[3G\x1b[?2026l')
    await rig.writeAwaitingRender('spinner')
    expect(rig.view.style.visibility).toBe('')
  })

  it('shows the overlay again when removed mid-frame', async () => {
    const rig = openTerminal()
    const cleanup = installTerminalImeSyncOutputHold(rig.terminal)
    await rig.write(SCREEN)
    rig.compose('ㄱ')
    await rig.write('\x1b[?2026h\x1b[5A')
    expect(rig.view.style.visibility).toBe('hidden')

    cleanup?.()
    expect(rig.view.style.visibility).toBe('')
  })
})
