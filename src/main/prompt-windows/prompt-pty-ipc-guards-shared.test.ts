import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PtyIpcSurface } from '../ipc/pty/pty-host-bindings'
import type { PtyIpcSession } from '../ipc/pty/session'
import {
  notePromptPtyWriter,
  promptGuardedPtyIpc,
  resetPromptPtyIpcGuardsForTests
} from './prompt-pty-ipc-guards'
import {
  recordPromptPtyOwner,
  registerPromptExtraWindow,
  resetPromptWindowRegistryForTests
} from './prompt-window-registry'
import { promptPtyViewerIds, setPromptSharedTabs } from './prompt-pty-viewers'
import {
  keepPromptExtraWindowDelivery,
  resetPromptExtraWindowDelivery,
  resetPromptPtyWindowDeliveryForTests
} from './prompt-pty-window-delivery'

type Listener = Parameters<PtyIpcSurface['on']>[1]

function contents(id: number) {
  return { id, isDestroyed: () => false, send: vi.fn() }
}

function fakeSession() {
  return {
    rendererDeliveryAccountingByPty: new Map<string, { sentChars: number; ackedChars: number }>(),
    pendingData: { get: () => undefined, size: 0, reactivateBlocked: () => false },
    pendingOverflowMarkedPtys: new Set<string>(),
    rendererInFlightTotalChars: 0,
    mainWindow: null as unknown,
    schedulePendingDataAfterCreditReport: vi.fn(),
    deletePendingPtyData: vi.fn(),
    updateProducerFlowControl: vi.fn()
  }
}

describe('pty IPC guards with shared tabs', () => {
  const main = contents(1)
  const w1 = contents(2)
  const listeners = new Map<string, Listener>()
  const handled = new Map<string, unknown[]>()
  let session: ReturnType<typeof fakeSession>

  function install(channel: string): void {
    const ipc: PtyIpcSurface = {
      handle: () => {},
      on: (ch, listener) => listeners.set(ch, listener),
      removeHandler: () => {},
      removeAllListeners: () => {}
    }
    promptGuardedPtyIpc(ipc, session as unknown as PtyIpcSession).on(channel, (_event, args) => {
      handled.set(channel, [...(handled.get(channel) ?? []), args])
    })
  }

  function send(channel: string, sender: { id: number }, args: unknown): void {
    listeners.get(channel)!({ sender } as never, args)
  }

  beforeEach(() => {
    session = fakeSession()
    listeners.clear()
    handled.clear()
    setPromptSharedTabs(true)
    registerPromptExtraWindow('w1', w1)
    for (const channel of [
      'pty:setHiddenRendererPty',
      'pty:setRendererPtyVisible',
      'pty:setActiveRendererPty',
      'pty:resize',
      'pty:ackData'
    ]) {
      install(channel)
    }
  })
  afterEach(() => {
    resetPromptPtyIpcGuardsForTests()
    resetPromptPtyWindowDeliveryForTests()
    resetPromptWindowRegistryForTests()
  })

  it('hides a pty only when every window showing it hides it', () => {
    recordPromptPtyOwner('p1', main)
    recordPromptPtyOwner('p1', w1)
    send('pty:setHiddenRendererPty', main, { id: 'p1', hidden: true })
    expect(handled.get('pty:setHiddenRendererPty')).toEqual([{ id: 'p1', hidden: false }])
    send('pty:setHiddenRendererPty', w1, { id: 'p1', hidden: true })
    expect(handled.get('pty:setHiddenRendererPty')).toEqual([
      { id: 'p1', hidden: false },
      { id: 'p1', hidden: true }
    ])
    // The window that last hid it closes: the remaining one still hides it, nothing changes.
    resetPromptExtraWindowDelivery(2)
    expect(handled.get('pty:setHiddenRendererPty')).toHaveLength(2)
  })

  it('shows a pty to delivery when any window shows it', () => {
    recordPromptPtyOwner('p1', main)
    recordPromptPtyOwner('p1', w1)
    send('pty:setRendererPtyVisible', main, { id: 'p1', visible: true })
    send('pty:setRendererPtyVisible', w1, { id: 'p1', visible: false })
    expect(handled.get('pty:setRendererPtyVisible')).toEqual([{ id: 'p1', visible: true }])
    // The showing window reloads: nobody shows it any more.
    resetPromptExtraWindowDelivery(2)
    send('pty:setRendererPtyVisible', main, { id: 'p1', visible: false })
    expect(handled.get('pty:setRendererPtyVisible')).toEqual([
      { id: 'p1', visible: true },
      { id: 'p1', visible: false }
    ])
  })

  it('resizes from the size owner only and applies a new owner’s last size', () => {
    recordPromptPtyOwner('p1', main)
    recordPromptPtyOwner('p1', w1)
    send('pty:resize', main, { id: 'p1', cols: 80, rows: 24 })
    send('pty:resize', w1, { id: 'p1', cols: 120, rows: 40 })
    expect(handled.get('pty:resize')).toEqual([{ id: 'p1', cols: 120, rows: 40 }])
    // Typing in the main window makes it the size owner; its size applies at once.
    notePromptPtyWriter({ sender: main }, 'p1')
    expect(handled.get('pty:resize')).toEqual([
      { id: 'p1', cols: 120, rows: 40 },
      { id: 'p1', cols: 80, rows: 24 }
    ])
    // Bringing the tab up in the other window hands the size back.
    send('pty:setActiveRendererPty', w1, { id: 'p1', active: true })
    expect(handled.get('pty:resize')?.at(-1)).toEqual({ id: 'p1', cols: 120, rows: 40 })
  })

  it('moves a window’s acknowledgements into main’s count with its offset', () => {
    recordPromptPtyOwner('p1', main)
    session.rendererDeliveryAccountingByPty.set('p1', { sentChars: 500, ackedChars: 500 })
    recordPromptPtyOwner('p1', w1)
    send('pty:ackData', main, { id: 'p1', processedChars: 600 })
    send('pty:ackData', w1, { id: 'p1', processedChars: 100 })
    expect(handled.get('pty:ackData')).toEqual([
      { id: 'p1', processedChars: 600 },
      { id: 'p1', processedChars: 600 }
    ])
  })

  it('drops the destroyed main window as a viewer on quit without reading it', () => {
    session.pendingData = { ...session.pendingData, keys: () => [][Symbol.iterator]() } as never
    session.mainWindow = { isDestroyed: () => false, webContents: main }
    recordPromptPtyOwner('p1', w1)
    keepPromptExtraWindowDelivery()()
    recordPromptPtyOwner('p1', main)
    session.mainWindow = {
      isDestroyed: () => true,
      get webContents(): never {
        throw new TypeError('Object has been destroyed')
      }
    }
    expect(() => keepPromptExtraWindowDelivery()()).not.toThrow()
    expect(promptPtyViewerIds('p1')).toEqual([2])
  })
})
