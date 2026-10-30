import {
  chmodSync,
  closeSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import {
  PROMPT_USER_DATA_MARKER_FILE,
  isPromptUserDataReady,
  type PromptUserDataMarker
} from '../../shared/prompt-user-data-location'

/**
 * Entries of the inherited folder that must not be copied. They describe processes that are
 * running right now (locks, sockets, terminal daemons and the helper copies they execute from),
 * not user data. Copying them would make the new folder claim another process's lock or daemon.
 */
const EXCLUDED_TOP_LEVEL_ENTRIES = new Set([
  'SingletonLock',
  'SingletonCookie',
  'SingletonSocket',
  'lockfile',
  'orcad.lock',
  '.profile-state-access',
  'daemon',
  'daemon-host'
])

const TEMP_SUFFIX = '.prompt-migrating-'
const SET_ASIDE_SUFFIX = '.prompt-set-aside-'

export type UserDataMigrationOutcome =
  | 'already-migrated'
  | 'fresh'
  | 'migrated'
  | 'deferred-legacy-in-use'
  | 'failed'

export type UserDataMigrationResult = {
  userDataPath: string
  outcome: UserDataMigrationOutcome
  error?: unknown
}

export type UserDataMigrationOptions = {
  legacyDir: string
  targetDir: string
  now?: () => number
  pid?: number
  /** True when another live process (old Prompt, upstream Orca, a server) has the folder open. */
  isLegacyInUse?: (legacyDir: string) => boolean
  isPidAlive?: (pid: number) => boolean
  /** Test seam: copy step, so interrupted copies can be simulated. */
  copyTree?: (from: string, to: string) => void
}

/**
 * Make the Prompt folder the userData folder, copying the inherited folder once.
 *
 * The inherited folder is never moved, changed or deleted: upstream Orca uses the same folder.
 * The copy goes to a temporary sibling and is renamed into place only after the marker is
 * written, so an interrupted copy is never mistaken for a finished one.
 */
export function migrateLegacyUserData(options: UserDataMigrationOptions): UserDataMigrationResult {
  const { legacyDir, targetDir } = options
  const now = options.now ?? Date.now
  const pid = options.pid ?? process.pid
  const isPidAlive = options.isPidAlive ?? defaultIsPidAlive
  const isLegacyInUse = options.isLegacyInUse ?? ((dir) => isUserDataFolderInUse(dir, isPidAlive))
  const copyTree = options.copyTree ?? copyUserDataTree

  if (isPromptUserDataReady(targetDir)) {
    return { userDataPath: targetDir, outcome: 'already-migrated' }
  }
  removeStaleTempCopies(targetDir, pid, isPidAlive)

  if (!hasEntries(legacyDir)) {
    try {
      setAsideIncompleteTarget(targetDir, now)
      mkdirSync(targetDir, { recursive: true, mode: 0o700 })
      writeMarker(targetDir, {
        version: 1,
        createdAtMs: now(),
        migratedFrom: null,
        firstRunProfile: true
      })
      return { userDataPath: targetDir, outcome: 'fresh' }
    } catch (error) {
      return { userDataPath: legacyDir, outcome: 'failed', error }
    }
  }

  // Copying while another process writes its databases could capture a torn snapshot.
  if (isLegacyInUse(legacyDir)) {
    return { userDataPath: legacyDir, outcome: 'deferred-legacy-in-use' }
  }

  const tempDir = `${targetDir}${TEMP_SUFFIX}${pid}-${now()}`
  try {
    copyTree(legacyDir, tempDir)
    chmodSync(tempDir, statSync(legacyDir).mode & 0o777)
    writeMarker(tempDir, { version: 1, createdAtMs: now(), migratedFrom: legacyDir })
    setAsideIncompleteTarget(targetDir, now)
    renameSync(tempDir, targetDir)
    return { userDataPath: targetDir, outcome: 'migrated' }
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true })
    // A concurrent launch may have finished the same copy first.
    if (isPromptUserDataReady(targetDir)) {
      return { userDataPath: targetDir, outcome: 'already-migrated' }
    }
    return { userDataPath: legacyDir, outcome: 'failed', error }
  }
}

export function copyUserDataTree(from: string, to: string): void {
  cpSync(from, to, {
    recursive: true,
    errorOnExist: true,
    force: false,
    preserveTimestamps: true,
    verbatimSymlinks: true,
    filter: (source) => {
      const rel = relative(from, source)
      if (rel === '') {
        return true
      }
      if (!rel.includes(sep) && EXCLUDED_TOP_LEVEL_ENTRIES.has(rel)) {
        return false
      }
      try {
        const stat = lstatSync(source)
        // Sockets and pipes belong to live processes and cannot be copied.
        return stat.isFile() || stat.isDirectory() || stat.isSymbolicLink()
      } catch {
        return false
      }
    }
  })
}

function writeMarker(dir: string, marker: PromptUserDataMarker): void {
  writeFileSync(join(dir, PROMPT_USER_DATA_MARKER_FILE), `${JSON.stringify(marker)}\n`, {
    mode: 0o600
  })
}

function hasEntries(dir: string): boolean {
  try {
    return readdirSync(dir).length > 0
  } catch {
    return false
  }
}

/** A target without a marker is not ours to use; keep it beside, never delete user files. */
function setAsideIncompleteTarget(targetDir: string, now: () => number): void {
  if (!existsSync(targetDir)) {
    return
  }
  if (!hasEntries(targetDir)) {
    rmdirSync(targetDir)
    return
  }
  renameSync(targetDir, `${targetDir}${SET_ASIDE_SUFFIX}${now()}`)
}

/** Remove partial copies left by a launch that was interrupted mid-copy. */
function removeStaleTempCopies(
  targetDir: string,
  pid: number,
  isPidAlive: (pid: number) => boolean
): void {
  const parent = dirname(targetDir)
  const prefix = `${basename(targetDir)}${TEMP_SUFFIX}`
  let names: string[]
  try {
    names = readdirSync(parent)
  } catch {
    return
  }
  for (const name of names) {
    if (!name.startsWith(prefix)) {
      continue
    }
    const ownerPid = Number(name.slice(prefix.length).split('-')[0])
    if (Number.isSafeInteger(ownerPid) && ownerPid !== pid && isPidAlive(ownerPid)) {
      continue
    }
    rmSync(join(parent, name), { recursive: true, force: true })
  }
}

function defaultIsPidAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function lockPidFromSingletonLock(dir: string): number | null {
  try {
    const target = readlinkSync(join(dir, 'SingletonLock'))
    const pid = Number(target.slice(target.lastIndexOf('-') + 1))
    return Number.isSafeInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

function lockPidFromProfileLock(dir: string): number | null {
  try {
    const parsed = JSON.parse(readFileSync(join(dir, 'orcad.lock'), 'utf8')) as { pid?: unknown }
    return typeof parsed.pid === 'number' && Number.isSafeInteger(parsed.pid) ? parsed.pid : null
  } catch {
    return null
  }
}

function windowsLockfileHeld(dir: string): boolean {
  if (process.platform !== 'win32') {
    return false
  }
  const lockfile = join(dir, 'lockfile')
  if (!existsSync(lockfile)) {
    return false
  }
  try {
    // Chromium keeps its profile lockfile open without write sharing while it runs (unverified on real Windows).
    closeSync(openSync(lockfile, 'r+'))
    return false
  } catch {
    return true
  }
}

export function isUserDataFolderInUse(
  dir: string,
  isPidAlive: (pid: number) => boolean = defaultIsPidAlive
): boolean {
  if (windowsLockfileHeld(dir)) {
    return true
  }
  for (const pid of [lockPidFromSingletonLock(dir), lockPidFromProfileLock(dir)]) {
    if (pid !== null && pid !== process.pid && isPidAlive(pid)) {
      return true
    }
  }
  return false
}
