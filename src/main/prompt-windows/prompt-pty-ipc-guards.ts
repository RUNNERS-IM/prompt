/**
 * Prompt extra windows: checks in front of Orca's terminal resize / visibility IPC.
 *
 * Orca assumes one renderer. With extra windows, several renderers send these messages:
 * - resize, active, visible and hidden reports apply only when they come from the window that
 *   shows the pty (a window that just handed a tab to another window may still report on it);
 * - an extra window's dispatcher handshake and resync answers are handled per window, so they
 *   do not reset or settle the main window's delivery state.
 *
 * With shared tabs several windows show one pty at once (prompt-window-registry.ts):
 * - only the size owner resizes it; a viewer that types into it or brings it up becomes the size
 *   owner, and its last reported size is applied then;
 * - hidden, visible, active and delivery-interest reports are combined over the viewers (hidden
 *   only when every viewer hides it; the others when any viewer says so), and Orca's handler only
 *   hears the combined value when it changes;
 * - acknowledgements are moved into main's count with the window's offset
 *   (prompt-pty-window-delivery.ts).
 */

import type { IpcMainEvent } from 'electron'
import type { PtyIpcSurface } from '../ipc/pty/pty-host-bindings'
import type { PtyIpcSession } from '../ipc/pty/session'
import { promptPtyControlAllowed } from './prompt-window-registry'
import {
  addPromptPtyViewersListener,
  isPromptSharedTabs,
  notePromptPtyDriver,
  promptPtySizeOwnerId,
  promptPtyViewerIds
} from './prompt-pty-viewers'
import { notePromptWindowTyped } from './prompt-window-focus-order'
import {
  bindPromptPtyDeliverySession,
  promptAckInMainCount,
  promptExtraWindowDispatcherReady,
  promptExtraWindowResyncResponse
} from './prompt-pty-window-delivery'

type Listener = Parameters<PtyIpcSurface['on']>[1]
type Sender = { id: number } | null | undefined

const SHOWING_WINDOW_ONLY = new Set([
  'pty:resize',
  'pty:setActiveRendererPty',
  'pty:setRendererPtyVisible',
  'pty:setHiddenRendererPty'
])

/** Shared tabs: per-viewer reports Orca's handlers get combined, by channel. */
const COMBINED: Record<string, { field: string; all: boolean }> = {
  'pty:setHiddenRendererPty': { field: 'hidden', all: true },
  'pty:setRendererPtyVisible': { field: 'visible', all: false },
  'pty:setActiveRendererPty': { field: 'active', all: false },
  'pty:setPtyDeliveryInterest': { field: 'interested', all: false }
}

type Reports = { byWindow: Map<number, boolean>; forwarded: boolean | undefined }

/** channel -> pty -> reports. */
const reports = new Map<string, Map<string, Reports>>()
/** Orca's handler per combined channel, to forward a changed value when viewers change. */
const combinedListeners = new Map<string, Listener>()
let resizeListener: Listener | null = null
/** pty -> window -> its last reported size, applied when that window becomes the size owner. */
const lastSizes = new Map<string, Map<number, { cols: number; rows: number }>>()

function senderOf(event: unknown): Sender {
  return (event as { sender?: Sender } | null | undefined)?.sender
}

function idOf(args: unknown): unknown {
  return (args as { id?: unknown } | null | undefined)?.id
}

function syntheticEvent(sender: Sender): IpcMainEvent {
  return { sender } as unknown as IpcMainEvent
}

function combine(channel: string, ptyId: string): boolean | undefined {
  const entry = reports.get(channel)?.get(ptyId)
  if (!entry) {
    return undefined
  }
  const viewers = promptPtyViewerIds(ptyId)
  // Nobody recorded as showing it yet: the reporting windows decide.
  const ids = viewers.length > 0 ? viewers : [...entry.byWindow.keys()]
  if (ids.length === 0) {
    return undefined
  }
  const { all } = COMBINED[channel]!
  // A viewer that has not reported counts as showing (not hidden), the safe side for delivery.
  return all
    ? ids.every((id) => entry.byWindow.get(id) === true)
    : ids.some((id) => entry.byWindow.get(id) === true)
}

function forwardIfChanged(channel: string, ptyId: string, event: IpcMainEvent): void {
  const listener = combinedListeners.get(channel)
  const entry = reports.get(channel)?.get(ptyId)
  const value = combine(channel, ptyId)
  if (!listener || !entry || value === undefined || value === entry.forwarded) {
    return
  }
  entry.forwarded = value
  listener(event, { id: ptyId, [COMBINED[channel]!.field]: value })
}

function applySizeOwnerSize(ptyId: string): void {
  const owner = promptPtySizeOwnerId(ptyId)
  const size = owner === null ? undefined : lastSizes.get(ptyId)?.get(owner)
  if (resizeListener && size && owner !== null) {
    resizeListener(syntheticEvent({ id: owner }), { id: ptyId, ...size })
  }
}

function noteDriver(ptyId: unknown, sender: Sender): void {
  if (typeof ptyId === 'string' && notePromptPtyDriver(ptyId, sender)) {
    applySizeOwnerSize(ptyId)
  }
}

/** Shared tabs: a window typed into a pty (write.ts, which is not behind these guards). */
export function notePromptPtyWriter(event: unknown, ptyId: unknown): void {
  const sender = senderOf(event)
  if (sender) {
    notePromptWindowTyped(sender.id)
  }
  if (isPromptSharedTabs()) {
    noteDriver(ptyId, sender)
  }
}

function onViewersChanged(ptyId: string, added: number | null): void {
  for (const channel of Object.keys(COMBINED)) {
    forwardIfChanged(channel, ptyId, syntheticEvent(null))
  }
  const sizes = lastSizes.get(ptyId)
  if (sizes) {
    const viewers = new Set(promptPtyViewerIds(ptyId))
    for (const id of sizes.keys()) {
      if (!viewers.has(id)) {
        sizes.delete(id)
      }
    }
  }
  // The size owner left: the viewer that inherits the size applies its own.
  if (added === null) {
    applySizeOwnerSize(ptyId)
  }
}

function sharedListener(channel: string, listener: Listener): Listener | null {
  if (channel in COMBINED) {
    combinedListeners.set(channel, listener)
    return (event, ...args) => {
      const ptyId = idOf(args[0])
      const sender = senderOf(event)
      if (typeof ptyId !== 'string' || !sender) {
        listener(event, ...args)
        return
      }
      const field = COMBINED[channel]!.field
      const value = (args[0] as Record<string, unknown>)[field] === true
      const byPty = reports.get(channel) ?? new Map<string, Reports>()
      reports.set(channel, byPty)
      const entry = byPty.get(ptyId) ?? { byWindow: new Map(), forwarded: undefined }
      byPty.set(ptyId, entry)
      entry.byWindow.set(sender.id, value)
      if (channel === 'pty:setActiveRendererPty' && value) {
        noteDriver(ptyId, sender)
      }
      forwardIfChanged(channel, ptyId, event)
    }
  }
  if (channel === 'pty:resize') {
    resizeListener = listener
    return (event, ...args) => {
      const size = args[0] as { id?: unknown; cols?: unknown; rows?: unknown } | undefined
      const sender = senderOf(event)
      if (
        sender &&
        typeof size?.id === 'string' &&
        typeof size.cols === 'number' &&
        typeof size.rows === 'number'
      ) {
        const sizes = lastSizes.get(size.id) ?? new Map()
        sizes.set(sender.id, { cols: size.cols, rows: size.rows })
        lastSizes.set(size.id, sizes)
      }
      if (promptPtyControlAllowed(sender, idOf(args[0]))) {
        listener(event, ...args)
      }
    }
  }
  if (channel === 'pty:ackData') {
    return (event, ...args) => {
      const ack = args[0] as { id?: unknown; processedChars?: unknown } | undefined
      if (typeof ack?.id === 'string' && typeof ack.processedChars === 'number') {
        listener(event, {
          ...ack,
          processedChars: promptAckInMainCount(senderOf(event), ack.id, ack.processedChars)
        })
        return
      }
      listener(event, ...args)
    }
  }
  return null
}

export function promptGuardPtyIpcListener(
  channel: string,
  listener: Listener,
  session: PtyIpcSession
): Listener {
  bindPromptPtyDeliverySession(session)
  addPromptPtyViewersListener(onViewersChanged)
  // Shared tabs is read at launch, possibly after these listeners are installed: decide per call.
  const shared = sharedListener(channel, listener)
  if (shared) {
    return (event, ...args) => {
      if (isPromptSharedTabs()) {
        shared(event, ...args)
      } else if (!SHOWING_WINDOW_ONLY.has(channel)) {
        listener(event, ...args)
      } else if (promptPtyControlAllowed(senderOf(event), idOf(args[0]))) {
        listener(event, ...args)
      }
    }
  }
  if (channel === 'pty:rendererDispatcherReady') {
    return (event, ...args) => {
      if (!promptExtraWindowDispatcherReady(senderOf(event), session)) {
        listener(event, ...args)
      }
    }
  }
  if (channel === 'pty:deliveryResyncResponse') {
    return (event, ...args) => {
      if (promptExtraWindowResyncResponse(senderOf(event), args[0] as never, session)) {
        return
      }
      const response = args[0] as { processedCharsByPty?: Record<string, number> } | undefined
      if (!isPromptSharedTabs() || !response?.processedCharsByPty) {
        listener(event, ...args)
        return
      }
      const sender = senderOf(event)
      const processedCharsByPty = Object.fromEntries(
        Object.entries(response.processedCharsByPty).map(([id, chars]) => [
          id,
          typeof chars === 'number' ? promptAckInMainCount(sender, id, chars) : chars
        ])
      )
      listener(event, { ...response, processedCharsByPty })
    }
  }
  return listener
}

/** The pty IPC surface with Prompt's per-window checks in front of the listeners above. */
export function promptGuardedPtyIpc(ipc: PtyIpcSurface, session: PtyIpcSession): PtyIpcSurface {
  return {
    handle: (channel, listener) => ipc.handle(channel, listener),
    on: (channel, listener) =>
      ipc.on(channel, promptGuardPtyIpcListener(channel, listener, session)),
    removeHandler: (channel) => ipc.removeHandler(channel),
    removeAllListeners: (channel) => ipc.removeAllListeners(channel)
  }
}

/** Test seam. */
export function resetPromptPtyIpcGuardsForTests(): void {
  reports.clear()
  combinedListeners.clear()
  resizeListener = null
  lastSizes.clear()
}
