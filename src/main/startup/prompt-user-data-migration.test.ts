import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { copyUserDataTree, migrateLegacyUserData } from './prompt-user-data-migration'
import {
  PROMPT_USER_DATA_MARKER_FILE,
  readPromptUserDataMarker
} from '../../shared/prompt-user-data-location'

/** Every path under a folder with its file bytes / link target, to prove the folder is unchanged. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const full = join(current, name)
      const stat = lstatSync(full)
      const key = relative(dir, full)
      if (stat.isSymbolicLink()) {
        out[key] = `link:${readlinkSync(full)}`
      } else if (stat.isDirectory()) {
        out[key] = `dir:${(stat.mode & 0o777).toString(8)}`
        walk(full)
      } else if (stat.isFile()) {
        out[key] = `file:${readFileSync(full, 'utf8')}:${stat.mtimeMs}`
      } else {
        out[key] = 'special'
      }
    }
  }
  walk(dir)
  return out
}

describe('migrateLegacyUserData', () => {
  let root: string
  let legacyDir: string
  let targetDir: string
  let servers: Server[]
  const notInUse = (): boolean => false
  const dead = (): boolean => false

  beforeEach(() => {
    // Short path: a unix socket path must stay under 104 bytes on macOS.
    root = mkdtempSync(join(tmpdir(), 'pm-'))
    legacyDir = join(root, 'orca')
    targetDir = join(root, 'Prompt')
    servers = []
  })

  afterEach(async () => {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))))
    rmSync(root, { recursive: true, force: true })
  })

  async function seedLegacyFolder(): Promise<void> {
    mkdirSync(join(legacyDir, 'profiles', 'local-default'), { recursive: true, mode: 0o700 })
    writeFileSync(join(legacyDir, 'orca-profile-index.json'), '{"profiles":["local-default"]}')
    writeFileSync(join(legacyDir, 'profiles', 'local-default', 'profile-state.db'), 'sessions')
    writeFileSync(join(legacyDir, 'profiles', 'local-default', 'profile-state.db-wal'), 'wal')
    writeFileSync(join(legacyDir, 'Cookies'), 'encrypted-cookie-bytes')
    mkdirSync(join(legacyDir, 'terminal-history', 'wt-1'), { recursive: true })
    writeFileSync(join(legacyDir, 'terminal-history', 'wt-1', 'checkpoint.json'), '{}')
    // Live-process state that must not be copied.
    symlinkSync('host-123', join(legacyDir, 'SingletonLock'))
    writeFileSync(join(legacyDir, 'orcad.lock'), '{"pid":123}')
    mkdirSync(join(legacyDir, '.profile-state-access', 'participants'), { recursive: true })
    mkdirSync(join(legacyDir, 'daemon'), { recursive: true })
    writeFileSync(join(legacyDir, 'daemon', 'daemon-v54.token'), 'token')
    writeFileSync(join(legacyDir, 'daemon', 'daemon-v54.pid'), '{"pid":456}')
    mkdirSync(join(legacyDir, 'daemon-host', 'macos', 'terminal-host-abc'), { recursive: true })
    writeFileSync(join(legacyDir, 'daemon-host', 'macos', 'terminal-host-abc', 'bin'), 'x')
    const server = createServer()
    await new Promise<void>((resolve) => server.listen(join(legacyDir, 'o-1.sock'), resolve))
    servers.push(server)
  }

  it('copies the old folder into a new Prompt folder and leaves the old one untouched', async () => {
    await seedLegacyFolder()
    const before = snapshot(legacyDir)

    const result = migrateLegacyUserData({
      legacyDir,
      targetDir,
      isLegacyInUse: notInUse,
      isPidAlive: dead,
      now: () => 1_000
    })

    expect(result).toEqual({ userDataPath: targetDir, outcome: 'migrated' })
    // Copied Orca settings keep their own Yolo choice.
    expect(readPromptUserDataMarker(targetDir)?.startYoloOff).toBeUndefined()
    expect(snapshot(legacyDir)).toEqual(before)
    expect(readFileSync(join(targetDir, 'orca-profile-index.json'), 'utf8')).toContain(
      'local-default'
    )
    expect(
      readFileSync(join(targetDir, 'profiles', 'local-default', 'profile-state.db'), 'utf8')
    ).toBe('sessions')
    expect(
      readFileSync(join(targetDir, 'profiles', 'local-default', 'profile-state.db-wal'), 'utf8')
    ).toBe('wal')
    expect(readFileSync(join(targetDir, 'Cookies'), 'utf8')).toBe('encrypted-cookie-bytes')
    expect(existsSync(join(targetDir, 'terminal-history', 'wt-1', 'checkpoint.json'))).toBe(true)
    // Locks, sockets and daemon records of running processes stay behind.
    for (const name of [
      'SingletonLock',
      'orcad.lock',
      '.profile-state-access',
      'daemon',
      'daemon-host',
      'o-1.sock'
    ]) {
      expect(existsSync(join(targetDir, name)), name).toBe(false)
    }
    expect(readPromptUserDataMarker(targetDir)).toStrictEqual({
      version: 1,
      createdAtMs: 1_000,
      migratedFrom: legacyDir
    })
    expect(statSync(targetDir).mode & 0o777).toBe(statSync(legacyDir).mode & 0o777)
    expect(readdirSync(root).sort()).toEqual(['Prompt', 'orca'])
  })

  it('creates an empty Prompt folder on a fresh install (old folder missing)', () => {
    const result = migrateLegacyUserData({ legacyDir, targetDir, isLegacyInUse: notInUse })

    expect(result.outcome).toBe('fresh')
    expect(result.userDataPath).toBe(targetDir)
    expect(readPromptUserDataMarker(targetDir)?.migratedFrom).toBeNull()
    expect(readPromptUserDataMarker(targetDir)?.firstRunProfile).toBe(true)
    // A brand-new profile asks the first launch to start with Yolo mode off.
    expect(readPromptUserDataMarker(targetDir)?.startYoloOff).toBe(true)
    expect(existsSync(legacyDir)).toBe(false)
  })

  it('does nothing once the Prompt folder is complete', async () => {
    await seedLegacyFolder()
    migrateLegacyUserData({ legacyDir, targetDir, isLegacyInUse: notInUse, isPidAlive: dead })
    writeFileSync(join(targetDir, 'Cookies'), 'newer-value-written-by-prompt')
    writeFileSync(join(legacyDir, 'Cookies'), 'written-later-by-upstream-orca')

    const result = migrateLegacyUserData({
      legacyDir,
      targetDir,
      isLegacyInUse: () => {
        throw new Error('must not look at the old folder again')
      }
    })

    expect(result).toEqual({ userDataPath: targetDir, outcome: 'already-migrated' })
    expect(readFileSync(join(targetDir, 'Cookies'), 'utf8')).toBe('newer-value-written-by-prompt')
  })

  it('redoes an interrupted copy and never uses the partial one', async () => {
    await seedLegacyFolder()
    const before = snapshot(legacyDir)
    // First launch dies halfway through copying.
    const interrupted = migrateLegacyUserData({
      legacyDir,
      targetDir,
      isLegacyInUse: notInUse,
      isPidAlive: dead,
      pid: 111,
      copyTree: (_from, to) => {
        mkdirSync(to, { recursive: true })
        writeFileSync(join(to, 'Cookies'), 'half')
        throw new Error('ENOSPC: disk full')
      }
    })
    expect(interrupted.outcome).toBe('failed')
    expect(interrupted.userDataPath).toBe(legacyDir)
    expect(existsSync(targetDir)).toBe(false)

    // A crash (not a thrown error) leaves the temporary sibling behind.
    const crashedTemp = join(root, 'Prompt.prompt-migrating-222-5')
    mkdirSync(crashedTemp)
    writeFileSync(join(crashedTemp, 'Cookies'), 'half')

    const result = migrateLegacyUserData({
      legacyDir,
      targetDir,
      isLegacyInUse: notInUse,
      isPidAlive: dead,
      pid: 333
    })

    expect(result.outcome).toBe('migrated')
    expect(readFileSync(join(targetDir, 'Cookies'), 'utf8')).toBe('encrypted-cookie-bytes')
    expect(existsSync(crashedTemp)).toBe(false)
    expect(snapshot(legacyDir)).toEqual(before)
    expect(readdirSync(root).sort()).toEqual(['Prompt', 'orca'])
  })

  it('keeps a running launch’s temporary copy', async () => {
    await seedLegacyFolder()
    const otherLaunchTemp = join(root, 'Prompt.prompt-migrating-777-5')
    mkdirSync(otherLaunchTemp)

    migrateLegacyUserData({
      legacyDir,
      targetDir,
      isLegacyInUse: notInUse,
      isPidAlive: (pid) => pid === 777,
      pid: 333
    })

    expect(existsSync(otherLaunchTemp)).toBe(true)
  })

  it('keeps using the old folder while another app has it open, and copies on a later launch', async () => {
    await seedLegacyFolder()

    const deferred = migrateLegacyUserData({ legacyDir, targetDir, isLegacyInUse: () => true })
    expect(deferred).toEqual({ userDataPath: legacyDir, outcome: 'deferred-legacy-in-use' })
    expect(existsSync(targetDir)).toBe(false)

    const later = migrateLegacyUserData({
      legacyDir,
      targetDir,
      isLegacyInUse: notInUse,
      isPidAlive: dead
    })
    expect(later.outcome).toBe('migrated')
  })

  it('sets aside a Prompt folder that has no completion marker instead of trusting or deleting it', async () => {
    await seedLegacyFolder()
    mkdirSync(join(targetDir, 'logs'), { recursive: true })
    writeFileSync(join(targetDir, 'logs', 'main.log'), 'early log line')

    const result = migrateLegacyUserData({
      legacyDir,
      targetDir,
      isLegacyInUse: notInUse,
      isPidAlive: dead,
      now: () => 42
    })

    expect(result.outcome).toBe('migrated')
    expect(readFileSync(join(root, 'Prompt.prompt-set-aside-42', 'logs', 'main.log'), 'utf8')).toBe(
      'early log line'
    )
    expect(existsSync(join(targetDir, PROMPT_USER_DATA_MARKER_FILE))).toBe(true)
  })

  it('reports failure and stays on the old folder when the copy cannot finish', async () => {
    await seedLegacyFolder()
    const result = migrateLegacyUserData({
      legacyDir,
      targetDir,
      isLegacyInUse: notInUse,
      isPidAlive: dead,
      copyTree: () => {
        throw new Error('EACCES')
      }
    })
    expect(result.outcome).toBe('failed')
    expect(result.userDataPath).toBe(legacyDir)
    expect(readdirSync(root)).toEqual(['orca'])
  })

  it('copies symlinks as links and skips sockets anywhere in the tree', async () => {
    mkdirSync(join(legacyDir, 'nested'), { recursive: true })
    symlinkSync('../Cookies', join(legacyDir, 'nested', 'link'))
    writeFileSync(join(legacyDir, 'Cookies'), 'c')
    const server = createServer()
    await new Promise<void>((resolve) =>
      server.listen(join(legacyDir, 'nested', 's.sock'), resolve)
    )
    servers.push(server)

    copyUserDataTree(legacyDir, targetDir)

    expect(readlinkSync(join(targetDir, 'nested', 'link'))).toBe('../Cookies')
    expect(existsSync(join(targetDir, 'nested', 's.sock'))).toBe(false)
  })
})
