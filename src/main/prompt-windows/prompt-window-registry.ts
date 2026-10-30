import { AsyncLocalStorage } from 'node:async_hooks'
import { PROMPT_MAIN_WINDOW_KEY as MAIN } from '../../shared/prompt-windows'

/**
 * Prompt windows, the state the rest of main reads (see shared/prompt-windows.ts). Kept free of
 * Electron imports so pty delivery code can call it cheaply.
 * - Extra windows by key; the main window has the key "main" and is not registered here.
 * - Tab owners: which window shows each tab. A tab missing from the table belongs to the main
 *   window. Entries are not dropped when a window closes during quit, so a restart restores them.
 * - Tabs moved into a window that has not saved them yet ("pending"): that window's saves must
 *   not drop them before it has loaded them.
 * - Terminal owners: the window that opened or attached a pty gets its output.
 */

type WebContentsLike = { id: number; isDestroyed: () => boolean; send: (...args: never[]) => void }

type WindowLike = { isDestroyed: () => boolean; webContents: WebContentsLike }

type ExtraWindow = { contents: WebContentsLike; window?: WindowLike }

const extraByKey = new Map<string, ExtraWindow>()
const keyByWebContentsId = new Map<number, string>()
const tabOwners = new Map<string, string>()
const pendingByKey = new Map<string, Set<string>>()
/** Terminals shown by an extra window, by the web contents id of that window. */
const ownerIdByPtyId = new Map<string, number>()
const spawnOwner = new AsyncLocalStorage<number>()
/** Extra windows whose terminal data dispatcher said it is listening (see pty delivery). */
const dispatcherReadyWebContentsIds = new Set<number>()
/** Each extra window's own selection (active workspace, tab groups …), see prompt-session-scope. */
const viewByKey = new Map<string, Record<string, unknown>>()
let onStateChanged: () => void = () => {}
let quitting = false

/** Called after tab owners or window selections change, to save them (prompt-windows.ts). */
export function setPromptWindowStateListener(listener: () => void): void {
  onStateChanged = listener
}

export function promptWindowView(key: string): Record<string, unknown> | undefined {
  return viewByKey.get(key)
}

export function setPromptWindowView(key: string, view: Record<string, unknown>): void {
  viewByKey.set(key, view)
  onStateChanged()
}

export function forgetPromptWindowView(key: string): void {
  viewByKey.delete(key)
}

export function registerPromptExtraWindow(
  key: string,
  contents: WebContentsLike,
  window?: WindowLike
): void {
  extraByKey.set(key, { contents, ...(window ? { window } : {}) })
  keyByWebContentsId.set(contents.id, key)
  dispatcherReadyWebContentsIds.delete(contents.id)
}

export function unregisterPromptExtraWindow(key: string, webContentsId: number): void {
  if (keyByWebContentsId.get(webContentsId) === key) {
    keyByWebContentsId.delete(webContentsId)
  }
  if (extraByKey.get(key)?.contents.id === webContentsId) {
    extraByKey.delete(key)
  }
  dispatcherReadyWebContentsIds.delete(webContentsId)
}

/** An open extra window by key (a BrowserWindow in the app). */
export function promptExtraWindowOf<T>(key: string | null | undefined): T | null {
  const win = key ? extraByKey.get(key)?.window : undefined
  return win && !win.isDestroyed() ? (win as unknown as T) : null
}

/** Every open extra window. */
export function promptExtraWindowList<T>(): T[] {
  return [...extraByKey.values()]
    .map((entry) => entry.window)
    .filter((win): win is WindowLike => !!win && !win.isDestroyed()) as unknown as T[]
}

export function promptExtraWindowCount(): number {
  return extraByKey.size
}

/** The window key of a renderer: an extra window's key, else "main". */
export function promptWindowKeyOfSender(sender: { id: number } | null | undefined): string {
  return (sender ? keyByWebContentsId.get(sender.id) : undefined) ?? MAIN
}

export function isPromptExtraWindowSender(sender: { id: number } | null | undefined): boolean {
  return !!sender && keyByWebContentsId.has(sender.id)
}

// ---- tab owners -------------------------------------------------------------------------------

export function promptTabOwnerKey(tabId: string): string {
  return tabOwners.get(tabId) ?? MAIN
}

export function setPromptTabOwner(tabId: string, key: string): void {
  if (key === MAIN) {
    tabOwners.delete(tabId)
  } else {
    tabOwners.set(tabId, key)
  }
  onStateChanged()
}

export function promptTabsOwnedBy(key: string): string[] {
  return [...tabOwners.entries()].filter(([, owner]) => owner === key).map(([tabId]) => tabId)
}

export function promptTabOwnerTable(): Record<string, string> {
  return Object.fromEntries(tabOwners)
}

/** Replaces the table (startup), keeping only owners that are one of `keys`. */
export function loadPromptTabOwners(
  table: Record<string, unknown> | null | undefined,
  keys: ReadonlySet<string>
): void {
  tabOwners.clear()
  for (const [tabId, key] of Object.entries(table ?? {})) {
    if (typeof key === 'string' && key !== MAIN && keys.has(key)) {
      tabOwners.set(tabId, key)
    }
  }
}

export function markPromptTabPending(key: string, tabId: string): void {
  const set = pendingByKey.get(key) ?? new Set<string>()
  set.add(tabId)
  pendingByKey.set(key, set)
}

export function isPromptTabPending(key: string, tabId: string): boolean {
  return pendingByKey.get(key)?.has(tabId) ?? false
}

export function clearPromptTabPending(key: string, tabId: string): void {
  pendingByKey.get(key)?.delete(tabId)
}

// ---- terminal owners --------------------------------------------------------------------------

function extraWindowWebContents(webContentsId: number): WebContentsLike | null {
  const key = keyByWebContentsId.get(webContentsId)
  const contents = key ? extraByKey.get(key)?.contents : undefined
  return contents && contents.id === webContentsId && !contents.isDestroyed() ? contents : null
}

/** The window that asked for a terminal now shows it (null or the main window: main shows it). */
export function recordPromptPtyOwner(
  ptyId: unknown,
  sender: { id: number } | null | undefined
): void {
  if (typeof ptyId !== 'string' || !ptyId) {
    return
  }
  if (sender && extraWindowWebContents(sender.id)) {
    ownerIdByPtyId.set(ptyId, sender.id)
  } else {
    ownerIdByPtyId.delete(ptyId)
  }
}

/** Runs a spawn so that a terminal id minted during it is owned by the requesting window. */
export function runPromptSpawnFor<T>(sender: { id: number } | null | undefined, spawn: () => T): T {
  return sender && extraWindowWebContents(sender.id) ? spawnOwner.run(sender.id, spawn) : spawn()
}

/** Called where terminal ids are minted, before the first output byte can be produced. */
export function notePromptMintedPtyId(ptyId: string): void {
  const owner = spawnOwner.getStore()
  if (owner !== undefined) {
    ownerIdByPtyId.set(ptyId, owner)
  }
}

export function forgetPromptPtyOwner(ptyId: string): void {
  ownerIdByPtyId.delete(ptyId)
}

/** The extra window that shows a pty, or null (main window). */
function ownerOfPty(ptyId: string): WebContentsLike | null {
  if (extraByKey.size === 0 || typeof ptyId !== 'string') {
    return null
  }
  const ownerId = ownerIdByPtyId.get(ptyId)
  if (ownerId === undefined) {
    return null
  }
  const contents = extraWindowWebContents(ownerId)
  if (!contents) {
    ownerIdByPtyId.delete(ptyId)
  }
  return contents
}

/** Web contents id of the extra window showing a pty, or null for the main window. */
export function promptPtyOwnerWebContentsId(ptyId: string): number | null {
  return ownerOfPty(ptyId)?.id ?? null
}

/** The window a pty was last given to, even if that window is gone (for writing off delivery). */
export function promptRecordedPtyOwnerId(ptyId: string): number | null {
  return ownerIdByPtyId.get(ptyId) ?? null
}

/** Where a pty's renderer events go: the extra window that shows it, else `fallback` (main). */
export function promptPtyWebContents<T>(fallback: T, ptyId: string): T {
  return (ownerOfPty(ptyId) as unknown as T | null) ?? fallback
}

/** Main window plus every open extra window, for messages each window must answer. */
export function promptAllPtyWebContents<T>(main: T): T[] {
  return [
    main,
    ...([...extraByKey.values()]
      .map((entry) => entry.contents)
      .filter((contents) => !contents.isDestroyed()) as T[])
  ]
}

/**
 * Whether pty data may be sent now. The main window's readiness (`mainReady`) covers ptys it
 * shows; an extra window's ptys wait for that window's own dispatcher handshake.
 */
export function promptPtyDispatcherReady(mainReady: boolean, ptyId: string): boolean {
  const owner = ownerOfPty(ptyId)
  return owner ? dispatcherReadyWebContentsIds.has(owner.id) : mainReady
}

export function setPromptExtraWindowDispatcherReady(webContentsId: number, ready: boolean): void {
  if (ready) {
    dispatcherReadyWebContentsIds.add(webContentsId)
  } else {
    dispatcherReadyWebContentsIds.delete(webContentsId)
  }
}

export function isPromptExtraWindowDispatcherReady(webContentsId: number): boolean {
  return dispatcherReadyWebContentsIds.has(webContentsId)
}

/**
 * A window may resize, hide or activate a pty only if it shows it: a window that just handed a
 * tab to another window may still report on it until it reloads.
 */
export function promptPtyControlAllowed(
  sender: { id: number } | null | undefined,
  ptyId: unknown
): boolean {
  if (typeof ptyId !== 'string' || !sender) {
    return true
  }
  const owner = ownerOfPty(ptyId)
  return owner ? owner.id === sender.id : !extraWindowWebContents(sender.id)
}

// ---- quit / close -----------------------------------------------------------------------------

/** The app is quitting: windows close one by one and must not change what is remembered. */
export function markPromptQuitting(): void {
  quitting = true
}

export function isPromptQuitting(): boolean {
  return quitting
}

/**
 * Closing the main window while extra windows are open hides it instead of closing it (as macOS
 * apps keep their other windows); the Dock icon or menu bar item shows it again.
 */
export function promptShouldHideMainWindowOnClose(isQuitting: boolean): boolean {
  return !isQuitting && !quitting && extraByKey.size > 0
}

/** Test seam. */
export function resetPromptWindowRegistryForTests(): void {
  extraByKey.clear()
  keyByWebContentsId.clear()
  tabOwners.clear()
  pendingByKey.clear()
  ownerIdByPtyId.clear()
  dispatcherReadyWebContentsIds.clear()
  viewByKey.clear()
  onStateChanged = () => {}
  quitting = false
}
