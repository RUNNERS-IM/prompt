/**
 * Terminal output delivery for Prompt extra windows.
 *
 * Orca delivers pty output to one window and keeps one "dispatcher ready" flag, one set of
 * in-flight accounting and one resync probe for it. With extra windows, each window receives
 * the output of the ptys it shows (see `promptPtyWebContents`), so:
 * - each extra window has its own ready flag; its ptys wait for its handshake, and its
 *   handshake no longer resets the main window's delivery state;
 * - when an extra window reloads or goes away, only its ptys' in-flight bytes are written off;
 * - when the main window reloads, the extra windows' ptys keep their delivery state;
 * - resync probes go to every window and every window's answer is applied.
 *
 * With shared tabs a pty can have several viewers (see prompt-window-registry.ts). Main counts the
 * bytes it sent a pty once; each renderer counts what it processed from 0 since it loaded. So the
 * count main had sent when a window started viewing is that window's offset, added to its
 * acknowledgements. A window that reloads or closes stops viewing; queued bytes stay for the
 * other viewers.
 */

import type { PtyIpcSession, RendererPtyDeliveryAccounting } from '../ipc/pty/session'
import { applyCumulativeAck } from '../ipc/pty/delivery/accounting'
import { tryGetProviderForPty } from '../ipc/pty/provider/registry'
import { activeRendererPtys, visibleRendererPtys } from '../ipc/pty/delivery/visibility-state'
import {
  getHiddenRendererPtyIds,
  isRuntimeOwnedHiddenRendererPty
} from '../ipc/pty/delivery/pty-hidden-delivery-gate'
import {
  isPromptExtraWindowDispatcherReady,
  isPromptExtraWindowSender,
  promptPtyOwnerWebContentsId,
  promptRecordedPtyOwnerId,
  setPromptExtraWindowDispatcherReady
} from './prompt-window-registry'
import {
  addPromptPtyViewersListener,
  isPromptSharedTabs,
  promptPtyViewerIds,
  removePromptPtyViewerWindow
} from './prompt-pty-viewers'

let boundSession: PtyIpcSession | null = null
/** Shared tabs: per pty, each viewer's acknowledgement offset (see above). */
const ackOffsets = new Map<string, Map<number, number>>()

function onViewersChanged(ptyId: string, added: number | null): void {
  const viewers = new Set(promptPtyViewerIds(ptyId))
  const offsets = ackOffsets.get(ptyId) ?? new Map<number, number>()
  for (const id of offsets.keys()) {
    if (!viewers.has(id)) {
      offsets.delete(id)
    }
  }
  if (added !== null && !offsets.has(added)) {
    offsets.set(added, boundSession?.rendererDeliveryAccountingByPty.get(ptyId)?.sentChars ?? 0)
  }
  if (offsets.size > 0) {
    ackOffsets.set(ptyId, offsets)
  } else {
    ackOffsets.delete(ptyId)
  }
}

/** Called with the pty IPC session before any window can attach (prompt-pty-ipc-guards.ts). */
export function bindPromptPtyDeliverySession(session: PtyIpcSession): void {
  boundSession = session
  addPromptPtyViewersListener(onViewersChanged)
}

/** A window's processed-character total in main's count of what was sent (see above). */
export function promptAckInMainCount(
  sender: { id: number } | null | undefined,
  ptyId: string,
  processedChars: number
): number {
  if (!isPromptSharedTabs() || !sender) {
    return processedChars
  }
  return processedChars + (ackOffsets.get(ptyId)?.get(sender.id) ?? 0)
}

function ptyIdsOf(session: PtyIpcSession): Set<string> {
  return new Set([...session.rendererDeliveryAccountingByPty.keys(), ...session.pendingData.keys()])
}

/**
 * Shared tabs: a window stopped viewing. Credit what it still owed so other viewers are not held
 * back by it; keep queued bytes when another window still shows the pty.
 */
function writeOffSharedViewer(session: PtyIpcSession, webContentsId: number): void {
  let creditedAny = false
  for (const id of removePromptPtyViewerWindow(webContentsId)) {
    const accounting = session.rendererDeliveryAccountingByPty.get(id)
    if (accounting) {
      const acknowledged = applyCumulativeAck(session, id, accounting.sentChars)
      if (acknowledged > 0) {
        creditedAny = true
        tryGetProviderForPty(id)?.acknowledgeDataEvent(id, acknowledged)
      }
    }
    if (promptPtyViewerIds(id).length > 0) {
      continue
    }
    if (session.pendingData.get(id)) {
      session.deletePendingPtyData(id)
      session.pendingOverflowMarkedPtys.delete(id)
      session.updateProducerFlowControl(id)
    }
    activeRendererPtys.delete(id)
    visibleRendererPtys.delete(id)
  }
  session.schedulePendingDataAfterCreditReport(creditedAny)
}

/** Forget what was sent to an extra window that can no longer acknowledge it. */
function writeOffExtraWindowDelivery(session: PtyIpcSession, webContentsId: number): void {
  if (isPromptSharedTabs()) {
    writeOffSharedViewer(session, webContentsId)
    return
  }
  let creditedAny = false
  for (const id of ptyIdsOf(session)) {
    if (promptRecordedPtyOwnerId(id) !== webContentsId) {
      continue
    }
    const accounting = session.rendererDeliveryAccountingByPty.get(id)
    if (accounting) {
      const acknowledged = applyCumulativeAck(session, id, accounting.sentChars)
      if (acknowledged > 0) {
        creditedAny = true
        tryGetProviderForPty(id)?.acknowledgeDataEvent(id, acknowledged)
      }
    }
    // The reloaded page restores from main's history; queued bytes would paint twice.
    if (session.pendingData.get(id)) {
      session.deletePendingPtyData(id)
      session.pendingOverflowMarkedPtys.delete(id)
      session.updateProducerFlowControl(id)
    }
    activeRendererPtys.delete(id)
    visibleRendererPtys.delete(id)
  }
  session.schedulePendingDataAfterCreditReport(creditedAny)
}

/**
 * `pty:rendererDispatcherReady` from an extra window. Returns true when handled here (the sender
 * is an extra window), so Orca's main-window handshake logic does not run for it.
 */
export function promptExtraWindowDispatcherReady(
  sender: { id: number } | null | undefined,
  session: PtyIpcSession
): boolean {
  if (!sender || !isPromptExtraWindowSender(sender)) {
    return false
  }
  boundSession = session
  if (isPromptExtraWindowDispatcherReady(sender.id)) {
    // A second handshake means the page was replaced without us seeing it.
    writeOffExtraWindowDelivery(session, sender.id)
  }
  // Another window may have hidden these ptys before the tab moved; this window decides now.
  // (Shared tabs combine every viewer's hidden report instead, see prompt-pty-ipc-guards.ts.)
  for (const id of isPromptSharedTabs() ? [] : getHiddenRendererPtyIds()) {
    if (promptPtyOwnerWebContentsId(id) === sender.id && !isRuntimeOwnedHiddenRendererPty(id)) {
      session.transitionSpawnHiddenRendererPtyDeliveryState(id, false)
    }
  }
  setPromptExtraWindowDispatcherReady(sender.id, true)
  session.pendingData.reactivateBlocked()
  session.schedulePendingDataFlush(0)
  return true
}

/** An extra window navigated, crashed or closed: its ptys wait for the next handshake. */
export function resetPromptExtraWindowDelivery(webContentsId: number): void {
  setPromptExtraWindowDispatcherReady(webContentsId, false)
  if (boundSession) {
    writeOffExtraWindowDelivery(boundSession, webContentsId)
  } else if (isPromptSharedTabs()) {
    removePromptPtyViewerWindow(webContentsId)
  }
}

/**
 * `pty:deliveryResyncResponse` from an extra window: apply its acknowledged totals (a max-merge,
 * so applying late answers is safe) without settling the main window's probe.
 */
export function promptExtraWindowResyncResponse(
  sender: { id: number } | null | undefined,
  args: { processedCharsByPty?: Record<string, number> } | undefined,
  session: PtyIpcSession
): boolean {
  if (!isPromptExtraWindowSender(sender)) {
    return false
  }
  let creditedAny = false
  for (const [id, processedChars] of Object.entries(args?.processedCharsByPty ?? {})) {
    if (typeof processedChars !== 'number' || !Number.isFinite(processedChars)) {
      continue
    }
    const acknowledged = applyCumulativeAck(
      session,
      id,
      promptAckInMainCount(sender, id, Math.max(0, processedChars))
    )
    if (acknowledged > 0) {
      creditedAny = true
      tryGetProviderForPty(id)?.acknowledgeDataEvent(id, acknowledged)
    }
  }
  session.schedulePendingDataAfterCreditReport(creditedAny)
  return true
}

type KeptPtyDelivery = {
  accounting?: RendererPtyDeliveryAccounting
  pending?: ReturnType<PtyIpcSession['pendingData']['get']>
  overflowMarked: boolean
  restoreNeeded: boolean
  active: boolean
  visible: boolean
}

/**
 * Called just before the main window's lifecycle reset clears all delivery state. Returns a
 * function to call right after it that puts back the state of ptys shown in extra windows,
 * which did not reload.
 */
export function keepPromptExtraWindowDelivery(): () => void {
  const session = boundSession
  if (!session) {
    return () => {}
  }
  // Shared tabs: the reloaded main window views nothing until it attaches again; ptys another
  // window still shows keep their delivery state.
  const shared = isPromptSharedTabs()
  if (shared) {
    const mainId = session.mainWindow?.webContents.id
    if (typeof mainId === 'number') {
      removePromptPtyViewerWindow(mainId)
    }
  }
  const shownElsewhere = (id: string): boolean =>
    shared ? promptPtyViewerIds(id).length > 0 : promptPtyOwnerWebContentsId(id) !== null
  const kept = new Map<string, KeptPtyDelivery>()
  for (const id of ptyIdsOf(session)) {
    if (!shownElsewhere(id)) {
      continue
    }
    const accounting = session.rendererDeliveryAccountingByPty.get(id)
    kept.set(id, {
      ...(accounting ? { accounting: { ...accounting } } : {}),
      pending: session.pendingData.get(id),
      overflowMarked: session.pendingOverflowMarkedPtys.has(id),
      restoreNeeded: session.rendererDeliveryRestoreNeededPtys.has(id),
      active: activeRendererPtys.has(id),
      visible: visibleRendererPtys.has(id)
    })
  }
  for (const id of [...activeRendererPtys, ...visibleRendererPtys]) {
    if (!kept.has(id) && shownElsewhere(id)) {
      kept.set(id, {
        overflowMarked: false,
        restoreNeeded: false,
        active: activeRendererPtys.has(id),
        visible: visibleRendererPtys.has(id)
      })
    }
  }
  return () => {
    for (const [id, state] of kept) {
      if (state.accounting) {
        session.rendererDeliveryAccountingByPty.set(id, state.accounting)
        session.rendererInFlightTotalChars += Math.max(
          0,
          state.accounting.sentChars - state.accounting.ackedChars
        )
      }
      if (state.pending) {
        session.setPendingPtyData(id, state.pending)
      }
      if (state.overflowMarked) {
        session.pendingOverflowMarkedPtys.add(id)
      }
      if (state.restoreNeeded) {
        session.rendererDeliveryRestoreNeededPtys.add(id)
      }
      if (state.active) {
        activeRendererPtys.add(id)
      }
      if (state.visible) {
        visibleRendererPtys.add(id)
      }
      session.updateProducerFlowControl(id)
    }
    if (kept.size > 0) {
      session.schedulePendingDataFlush(0)
    }
  }
}

/** Test seam. */
export function resetPromptPtyWindowDeliveryForTests(): void {
  boundSession = null
  ackOffsets.clear()
}
