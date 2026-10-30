import { existsSync, realpathSync } from 'node:fs'
import { basename, isAbsolute, join, relative, toNamespacedPath } from 'node:path'
import { ORCAD_PROMPT_NATIVE_FILENAME } from './orcad-artifacts'
import { openPromptNative } from './prompt-native-module'

// The Windows security part of Prompt's native module (native/prompt-native/src/windows_security.rs and
// windows_isolated_spawn.rs). Every native call throws an Error whose message names the Win32 call and its code.

export type GrantAccessOptions = {
  /** Children inherit the grant (OI|CI). Only meaningful on a directory. */
  inheritable: boolean
  /**
   * SET_ACCESS: drop every explicit rule for the trustee, allow and deny, then grant exactly
   * `accessMask`. Otherwise GRANT_ACCESS: add `accessMask` to what the trustee is already allowed.
   */
  replace: boolean
}

/**
 * One DACL entry as stored. `type` and `flags` are the raw ACE_HEADER bytes; `sid` is set only for
 * plain allow (0) and deny (1) ACEs and is null for every other type.
 */
export type WindowsAce = { type: number; flags: number; mask: number; sid: string | null }

/** `protected` is SE_DACL_PROTECTED. */
export type WindowsDacl = { protected: boolean; aces: WindowsAce[] }

export type StdHandleInheritanceFailure = { stream: 'stdin' | 'stdout' | 'stderr'; code: number }

/**
 * `exitWatchError` is the Win32 code when the exit can't be observed; the child still runs.
 * `breakawayDenied`: a job this process is in forbids breakaway, so the child stays in it.
 */
export type IsolatedSpawnResult = {
  pid: number
  exitWatchError: number | null
  breakawayDenied: boolean
}

export type WindowsSecurityAddon = {
  /** The process token's user SID, e.g. `S-1-5-21-…-1001`. */
  currentUserSid(): string
  /** The path's DACL as structure, or null for a NULL DACL (which grants everyone everything). */
  getDaclAces(path: string): WindowsDacl | null
  /**
   * Installs exactly the DACL in `sddl`. Its `P` flag picks protected or inheriting. A directory
   * propagates to every existing descendant, which is seconds on a large tree.
   */
  setDaclSddl(path: string, sddl: string): void
  setDaclSddlAsync(path: string, sddl: string): Promise<void>
  /** Creates a NEW file already carrying the DACL in `sddl`, then writes `data` into it. */
  createFileWithDacl(path: string, sddl: string, data: Uint8Array, strict?: boolean): void
  /** Read bounded regular-file bytes and their DACL through one handle, excluding writers/replacement. */
  readFileWithDacl(
    path: string,
    maxBytes: number
  ): { data: Uint8Array; dacl: WindowsDacl | null } | null
  /** Missing returns null; native read failures carry syscall='CredReadW' and numeric win32Code. */
  readGenericCredential(target: string): Uint8Array | null
  writeGenericCredential(target: string, user: string, data: Uint8Array): void
  /**
   * Adds an allow rule for `sid` to the existing DACL, keeping its protection state; Windows orders
   * the result canonically. A NULL DACL already allows everyone, so it is left untouched.
   */
  grantAccess(path: string, sid: string, accessMask: number, options: GrantAccessOptions): void
  grantAccessAsync(
    path: string,
    sid: string,
    accessMask: number,
    options: GrantAccessOptions
  ): Promise<void>
  /**
   * Makes the process's std handles non-inheritable, skipping absent ones. Never throws; returns the
   * handles SetHandleInformation rejected (e.g. a legacy console pseudo-handle) with their Win32 code.
   */
  clearStdHandleInheritance(): StdHandleInheritanceFailure[]
  /**
   * Starts `file` detached, hidden and outside this process's jobs where they allow it, inheriting
   * only a NUL handle for its stdio, so none of this process's other inheritable handles reach it.
   * `commandLine` is the full, already quoted line (argv[0] included); an empty `cwd` keeps ours;
   * `environmentBlock` is `K=V\0…\0\0`. `onExit` gets the exit code and never keeps the event loop
   * alive. Throws an Error naming the failed Win32 call.
   */
  spawnDetachedIsolated(
    file: string,
    commandLine: string,
    cwd: string,
    environmentBlock: string,
    onExit: (code: number) => void
  ): IsolatedSpawnResult
  /** True on builds whose isolated spawn requests job breakaway; older binaries lack the export. */
  isolatedSpawnBreaksAwayFromJob(): boolean
  /** Whether the loaded binary exports `name`; calls nothing. */
  hasNativeExport(name: string): boolean
}

/** The addon (every path namespaced, async writes ordered per path) and the token's user SID. */
export type WindowsSecurity = {
  addon: Omit<WindowsSecurityAddon, 'currentUserSid'>
  userSid: string
}

/** FILE_ALL_ACCESS, what SDDL prints as `FA`. */
export const WINDOWS_FILE_ALL_ACCESS = 0x1f01ff
/** FILE_GENERIC_READ | FILE_GENERIC_EXECUTE, what icacls calls `(RX)`. */
export const WINDOWS_FILE_READ_EXECUTE = 0x1200a9

let loaded: WindowsSecurity | { error: string } | null = null

/** Load orcad’s staged module at its slot root; desktop/CLI copies must resolve inside the app.
 * Only fixed paths are tried, so nothing can be picked up from C:\node_modules, which another local user can create. */
export function loadWindowsSecurity(): WindowsSecurity | { error: string } {
  loaded ??= loadOnce()
  return loaded
}

function loadOnce(): WindowsSecurity | { error: string } {
  if (process.platform !== 'win32') {
    return { error: `unsupported on ${process.platform}` }
  }
  const failures: string[] = []
  const candidates = [
    () => join(__dirname, ORCAD_PROMPT_NATIVE_FILENAME),
    () => join(__dirname, '..', '..', ORCAD_PROMPT_NATIVE_FILENAME),
    () => trustedPackagePath(appPromptNativePath(), appRoots())
  ]
  for (const candidate of candidates) {
    try {
      const exports = openPromptNative(candidate())
      // Reading the SID is also what proves the module answers.
      return prepare({
        ...(exports as Omit<WindowsSecurityAddon, 'hasNativeExport'>),
        hasNativeExport: (name) => typeof exports[name] === 'function'
      })
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))
    }
  }
  return { error: failures.join('; ') }
}

/** Packaged resources or checkout root; electron-vite chunks sit one level deeper in out/main/chunks. */
function appRoots(): string[] {
  const checkout = checkoutRoot()
  // Electron only, so not on Node's Process type; the CLI runs under Electron as Node too.
  return 'resourcesPath' in process && typeof process.resourcesPath === 'string'
    ? [process.resourcesPath, checkout]
    : [checkout]
}

function checkoutRoot(): string {
  return basename(__dirname) === 'chunks'
    ? join(__dirname, '..', '..', '..')
    : join(__dirname, '..', '..')
}

/** Resources/prompt-native.node when packaged (and in the relocated daemon host), else the checkout's dev build. */
function appPromptNativePath(): string {
  if ('resourcesPath' in process && typeof process.resourcesPath === 'string') {
    const packaged = join(process.resourcesPath, ORCAD_PROMPT_NATIVE_FILENAME)
    if (existsSync(packaged)) {
      return packaged
    }
  }
  return join(
    checkoutRoot(),
    'native',
    'prompt-native',
    `prompt-native.${process.platform}-${process.arch}.node`
  )
}

/** `resolved` when its real location is inside one of `roots`; throws otherwise. */
export function trustedPackagePath(resolved: string, roots: readonly string[]): string {
  const real = realpathSync(resolved)
  const inside = roots.some((root) => {
    const fromRoot = relative(realpathSync(root), real)
    return fromRoot !== '' && !fromRoot.startsWith('..') && !isAbsolute(fromRoot)
  })
  if (!inside) {
    throw new Error(`refusing prompt-native outside the app: ${real}`)
  }
  return real
}

/** Namespace paths once for MAX_PATH-limited Win32 APIs. Serialize async writes per path so a read/merge grant cannot race a re-lock and restore broader access.
 * Sync grants finish on main before restrictAsync’s post-apply verification; a broader result fails verification and evicts the directory for bounded retry. */
function prepare(raw: WindowsSecurityAddon): WindowsSecurity {
  const writes = new Map<string, Promise<unknown>>()
  const inPathOrder = (path: string, write: (namespaced: string) => Promise<void>) => {
    const namespaced = toNamespacedPath(path)
    const key = namespaced.toLowerCase()
    const run = () => write(namespaced)
    const next = (writes.get(key) ?? Promise.resolve()).then(run, run)
    const settled = next.catch(() => undefined)
    writes.set(key, settled)
    void settled.then(() => {
      if (writes.get(key) === settled) {
        writes.delete(key)
      }
    })
    return next
  }
  return {
    userSid: raw.currentUserSid(),
    addon: {
      getDaclAces: (path) => raw.getDaclAces(toNamespacedPath(path)),
      setDaclSddl: (path, sddl) => raw.setDaclSddl(toNamespacedPath(path), sddl),
      setDaclSddlAsync: (path, sddl) =>
        inPathOrder(path, (namespaced) => raw.setDaclSddlAsync(namespaced, sddl)),
      createFileWithDacl: (path, sddl, data, strict) =>
        raw.createFileWithDacl(toNamespacedPath(path), sddl, data, strict),
      readFileWithDacl: (path, maxBytes) => raw.readFileWithDacl(toNamespacedPath(path), maxBytes),
      readGenericCredential: (target) => raw.readGenericCredential(target),
      writeGenericCredential: (target, user, data) =>
        raw.writeGenericCredential(target, user, data),
      grantAccess: (path, sid, mask, options) =>
        raw.grantAccess(toNamespacedPath(path), sid, mask, options),
      grantAccessAsync: (path, sid, mask, options) =>
        inPathOrder(path, (namespaced) => raw.grantAccessAsync(namespaced, sid, mask, options)),
      clearStdHandleInheritance: () => raw.clearStdHandleInheritance(),
      spawnDetachedIsolated: (file, commandLine, cwd, environmentBlock, onExit) =>
        raw.spawnDetachedIsolated(file, commandLine, cwd, environmentBlock, onExit),
      isolatedSpawnBreaksAwayFromJob: () => raw.isolatedSpawnBreaksAwayFromJob(),
      hasNativeExport: (name) => raw.hasNativeExport(name)
    }
  }
}

/** Wrap fake addons identically to production; null simulates load failure. */
export function setWindowsSecurityForTests(addon: WindowsSecurityAddon | null): void {
  loaded = addon ? prepare(addon) : { error: 'disabled for tests' }
}

export function resetWindowsSecurityLoadForTests(): void {
  loaded = null
}
