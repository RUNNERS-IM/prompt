/**
 * Prompt extra windows: checks in front of Orca's terminal resize / visibility IPC.
 *
 * Orca assumes one renderer. With extra windows, several renderers send these messages:
 * - resize, active, visible and hidden reports apply only when they come from the window that
 *   shows the pty (a window that just handed a tab to another window may still report on it);
 * - an extra window's dispatcher handshake and resync answers are handled per window, so they
 *   do not reset or settle the main window's delivery state.
 */

import type { PtyIpcSurface } from '../ipc/pty/pty-host-bindings'
import type { PtyIpcSession } from '../ipc/pty/session'
import { promptPtyControlAllowed } from './prompt-window-registry'
import {
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

function senderOf(event: unknown): Sender {
  return (event as { sender?: Sender } | null | undefined)?.sender
}

function idOf(args: unknown): unknown {
  return (args as { id?: unknown } | null | undefined)?.id
}

export function promptGuardPtyIpcListener(
  channel: string,
  listener: Listener,
  session: PtyIpcSession
): Listener {
  if (SHOWING_WINDOW_ONLY.has(channel)) {
    return (event, ...args) => {
      if (promptPtyControlAllowed(senderOf(event), idOf(args[0]))) {
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
      if (!promptExtraWindowResyncResponse(senderOf(event), args[0] as never, session)) {
        listener(event, ...args)
      }
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
