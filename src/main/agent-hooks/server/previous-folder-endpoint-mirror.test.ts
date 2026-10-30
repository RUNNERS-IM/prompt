import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  getEndpointFileName,
  writeEndpointFile
} from '../../../shared/agent-hook-listener/endpoint-publication'
import {
  hasPromptDaemonInPreviousFolder,
  mirrorEndpointToPreviousDataFolder
} from './previous-folder-endpoint-mirror'

const endpoint = {
  port: 61234,
  token: 'new-token',
  env: 'production',
  version: '1',
  openCodeTui: true,
  transport: 'raw-json-v1'
}

describe('hook endpoint for terminals opened before the data folder moved', () => {
  let root: string
  let previousFolder: string
  let oldEndpoint: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'hep-'))
    previousFolder = join(root, 'orca')
    oldEndpoint = join(previousFolder, 'agent-hooks', getEndpointFileName())
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const write = (dir: string, file: string): boolean => writeEndpointFile(dir, file, endpoint)

  it('points the old endpoint file at the running Prompt so old terminals keep reporting', () => {
    mkdirSync(join(previousFolder, 'agent-hooks'), { recursive: true })
    writeFileSync(oldEndpoint, 'ORCA_AGENT_HOOK_PORT=50000\nORCA_AGENT_HOOK_TOKEN=old\n')

    const mirrored = mirrorEndpointToPreviousDataFolder(write, {
      previous: { userDataPath: previousFolder, migratedAtMs: 1 },
      isFolderInUse: () => false,
      hasPromptDaemon: () => true
    })

    expect(mirrored).toBe(true)
    const content = readFileSync(oldEndpoint, 'utf8')
    expect(content).toContain('ORCA_AGENT_HOOK_PORT=61234')
    expect(content).toContain('ORCA_AGENT_HOOK_TOKEN=new-token')
  })

  it('leaves the file alone while upstream Orca uses the old folder', () => {
    mkdirSync(join(previousFolder, 'agent-hooks'), { recursive: true })
    writeFileSync(oldEndpoint, 'ORCA_AGENT_HOOK_PORT=50000\n')
    const spy = vi.fn(write)

    expect(
      mirrorEndpointToPreviousDataFolder(spy, {
        previous: { userDataPath: previousFolder, migratedAtMs: 1 },
        isFolderInUse: () => true,
        hasPromptDaemon: () => true
      })
    ).toBe(false)
    expect(spy).not.toHaveBeenCalled()
    expect(readFileSync(oldEndpoint, 'utf8')).toBe('ORCA_AGENT_HOOK_PORT=50000\n')
  })

  it('never creates a file in the old folder and does nothing without a previous folder', () => {
    const spy = vi.fn(write)
    expect(
      mirrorEndpointToPreviousDataFolder(spy, {
        previous: { userDataPath: previousFolder, migratedAtMs: 1 },
        isFolderInUse: () => false,
        hasPromptDaemon: () => true
      })
    ).toBe(false)
    expect(existsSync(previousFolder)).toBe(false)
    expect(mirrorEndpointToPreviousDataFolder(spy, { previous: null })).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })

  it('stops once no daemon Prompt started before the move is alive', () => {
    mkdirSync(join(previousFolder, 'agent-hooks'), { recursive: true })
    writeFileSync(oldEndpoint, 'ORCA_AGENT_HOOK_PORT=50000\n')
    mkdirSync(join(previousFolder, 'daemon'), { recursive: true })
    const previous = { userDataPath: previousFolder, migratedAtMs: 2_000 }
    const pidFile = join(previousFolder, 'daemon', 'daemon-v54.pid')

    writeFileSync(pidFile, JSON.stringify({ pid: process.pid, startedAtMs: 1_000 }))
    expect(hasPromptDaemonInPreviousFolder(previous)).toBe(true)
    // Started after the move: upstream Orca's daemon, not one of Prompt's old terminals.
    writeFileSync(pidFile, JSON.stringify({ pid: process.pid, startedAtMs: 3_000 }))
    expect(hasPromptDaemonInPreviousFolder(previous)).toBe(false)
    writeFileSync(pidFile, JSON.stringify({ pid: 2 ** 22 + 12_345, startedAtMs: 1_000 }))
    expect(hasPromptDaemonInPreviousFolder(previous)).toBe(false)

    const spy = vi.fn(write)
    expect(mirrorEndpointToPreviousDataFolder(spy, { previous, isFolderInUse: () => false })).toBe(
      false
    )
    expect(spy).not.toHaveBeenCalled()
  })
})
