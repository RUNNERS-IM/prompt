import { AsyncLocalStorage } from 'node:async_hooks'
import { promptRepoIdOfWorktreeId } from '../../shared/prompt-project-windows'
import { parsePtySessionId } from '../../shared/pty-session-id-format'

/**
 * Prompt project windows, the state the rest of main reads. A project open in its own window is
 * owned by that window: its terminals' output goes there, its session records are written only by
 * that window, and the main window shows a single row for it. Kept free of Electron imports so pty
 * delivery code can call it cheaply.
 */

type WebContentsLike = { id: number; isDestroyed: () => boolean; send: (...args: never[]) => void }

type WindowLike = { isDestroyed: () => boolean; webContents: WebContentsLike }

const webContentsByRepoId = new Map<string, WebContentsLike>()
const windowByRepoId = new Map<string, WindowLike>()
let readStoredSession: () => unknown = () => undefined
const repoIdByWebContentsId = new Map<number, string>()
/** Projects whose window just closed: main keeps ignoring the main window's stale records for them
 *  until the main window has reloaded and read them back. */
const heldForMainReload = new Set<string>()
const worktreeIdByPtyId = new Map<string, string>()
/** Terminals shown by an extra window, by the web contents id of that window. */
const ownerIdByPtyId = new Map<string, number>()
const spawnOwner = new AsyncLocalStorage<number>()
/** Project windows whose terminal data dispatcher said it is listening (see pty delivery). */
const dispatcherReadyWebContentsIds = new Set<number>()

export function registerPromptProjectWindow(
  repoId: string,
  webContents: WebContentsLike,
  window?: WindowLike
): void {
  webContentsByRepoId.set(repoId, webContents)
  if (window) {
    windowByRepoId.set(repoId, window)
  }
  repoIdByWebContentsId.set(webContents.id, repoId)
  dispatcherReadyWebContentsIds.delete(webContents.id)
  heldForMainReload.delete(repoId)
}

export function unregisterPromptProjectWindow(repoId: string, webContentsId: number): void {
  if (repoIdByWebContentsId.get(webContentsId) === repoId) {
    repoIdByWebContentsId.delete(webContentsId)
  }
  if (webContentsByRepoId.get(repoId)?.id === webContentsId) {
    webContentsByRepoId.delete(repoId)
    windowByRepoId.delete(repoId)
    heldForMainReload.add(repoId)
  }
  dispatcherReadyWebContentsIds.delete(webContentsId)
}

/** The open project window of a project, if any (a BrowserWindow in the app). */
export function promptProjectWindowOf<T>(repoId: string | null | undefined): T | null {
  const win = repoId ? windowByRepoId.get(repoId) : undefined
  return win && !win.isDestroyed() ? (win as unknown as T) : null
}

/** Every open project window. */
export function promptProjectWindowList<T>(): T[] {
  return [...windowByRepoId.values()].filter((win) => !win.isDestroyed()) as unknown as T[]
}

/** How to read the saved workspace session (set by the window manager, which has the store). */
export function setPromptStoredSessionReader(reader: () => unknown): void {
  readStoredSession = reader
}

export function promptStoredWorkspaceSession(): unknown {
  return readStoredSession()
}

/** The main window reloaded and now reads the project's records again from disk. */
export function releasePromptReposHeldForMainReload(): void {
  heldForMainReload.clear()
}

export function promptOpenProjectRepoIds(): string[] {
  return [...webContentsByRepoId.keys()]
}

/** The project a window shows, or null when the sender is not a project window. */
export function promptProjectRepoIdOfSender(
  sender: { id: number } | null | undefined
): string | null {
  return sender ? (repoIdByWebContentsId.get(sender.id) ?? null) : null
}

export function isPromptProjectWindowSender(sender: { id: number } | null | undefined): boolean {
  return promptProjectRepoIdOfSender(sender) !== null
}

/** Projects the main window must not write: open elsewhere, or waiting for its reload. */
export function promptReposMainWindowMustNotWrite(): Set<string> {
  return new Set([...webContentsByRepoId.keys(), ...heldForMainReload])
}

export function recordPromptPtyWorktree(ptyId: unknown, worktreeId: unknown): void {
  if (typeof ptyId === 'string' && ptyId && typeof worktreeId === 'string' && worktreeId) {
    worktreeIdByPtyId.set(ptyId, worktreeId)
  }
}

function extraWindowWebContents(webContentsId: number): WebContentsLike | null {
  const repoId = repoIdByWebContentsId.get(webContentsId)
  const contents = repoId ? webContentsByRepoId.get(repoId) : undefined
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

/**
 * The extra window that shows a pty, or null (main window). A terminal's own owner (the window
 * that opened or attached it) wins; otherwise a pty of a project open in its own window belongs
 * to that window. Pty ids minted by Orca start with their worktree id ("<worktreeId>@@<suffix>").
 */
function ownerOfPty(ptyId: string): WebContentsLike | null {
  if (webContentsByRepoId.size === 0 || typeof ptyId !== 'string') {
    return null
  }
  const ownerId = ownerIdByPtyId.get(ptyId)
  if (ownerId !== undefined) {
    const contents = extraWindowWebContents(ownerId)
    if (contents) {
      return contents
    }
    ownerIdByPtyId.delete(ptyId)
  }
  const worktreeId = worktreeIdByPtyId.get(ptyId) ?? parsePtySessionId(ptyId).worktreeId
  const repoId = worktreeId ? promptRepoIdOfWorktreeId(worktreeId) : null
  const owner = repoId ? webContentsByRepoId.get(repoId) : undefined
  return owner && !owner.isDestroyed() ? owner : null
}

/** The project a pty belongs to when that project is open in its own window, else null. */
export function promptPtyOwnerRepoId(ptyId: string): string | null {
  const owner = ownerOfPty(ptyId)
  return owner ? (repoIdByWebContentsId.get(owner.id) ?? null) : null
}

/**
 * Where a pty's renderer events go: the project window that owns its project, else the given
 * (main window) web contents.
 */
export function promptPtyWebContents<T>(fallback: T, ptyId: string): T {
  return (ownerOfPty(ptyId) as unknown as T | null) ?? fallback
}

/** Main window plus every open project window, for messages each window must answer. */
export function promptAllPtyWebContents<T>(main: T): T[] {
  return [main, ...([...webContentsByRepoId.values()].filter((w) => !w.isDestroyed()) as T[])]
}

/**
 * Whether pty data may be sent now. The main window's readiness (`mainReady`) covers ptys it
 * shows; a project window's ptys wait for that window's own dispatcher handshake.
 */
export function promptPtyDispatcherReady(mainReady: boolean, ptyId: string): boolean {
  const owner = ownerOfPty(ptyId)
  return owner ? dispatcherReadyWebContentsIds.has(owner.id) : mainReady
}

export function setPromptProjectWindowDispatcherReady(webContentsId: number, ready: boolean): void {
  if (ready) {
    dispatcherReadyWebContentsIds.add(webContentsId)
  } else {
    dispatcherReadyWebContentsIds.delete(webContentsId)
  }
}

export function isPromptProjectWindowDispatcherReady(webContentsId: number): boolean {
  return dispatcherReadyWebContentsIds.has(webContentsId)
}

/**
 * A window may resize, hide or activate a pty only if it shows it: the main window still holds
 * stale copies of tabs whose project moved to its own window, and a project window holds copies
 * of every other project's tabs; neither may shrink or mute ptys shown elsewhere.
 */
export function promptPtyControlAllowed(
  sender: { id: number } | null | undefined,
  ptyId: unknown
): boolean {
  if (typeof ptyId !== 'string') {
    return true
  }
  if (!sender) {
    return true
  }
  // Each window also holds stale copies of tabs shown in other windows; only the showing one counts.
  const owner = ownerOfPty(ptyId)
  return owner ? owner.id === sender.id : !extraWindowWebContents(sender.id)
}

let quitting = false

/** The app is quitting: windows close one by one and must not change what is remembered. */
export function markPromptQuitting(): void {
  quitting = true
}

export function isPromptQuitting(): boolean {
  return quitting
}

/**
 * Closing the main window while project windows are open hides it instead of closing it (as
 * macOS apps keep their other windows); the Dock icon or menu bar item shows it again.
 */
export function promptShouldHideMainWindowOnClose(isQuitting: boolean): boolean {
  return !isQuitting && !quitting && webContentsByRepoId.size > 0
}

/** Test seam. */
export function resetPromptProjectWindowRegistryForTests(): void {
  webContentsByRepoId.clear()
  windowByRepoId.clear()
  readStoredSession = () => undefined
  repoIdByWebContentsId.clear()
  heldForMainReload.clear()
  worktreeIdByPtyId.clear()
  ownerIdByPtyId.clear()
  dispatcherReadyWebContentsIds.clear()
  quitting = false
}
