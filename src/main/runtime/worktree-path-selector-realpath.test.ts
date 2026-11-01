/** A path typed through a symlink names the same local checkout as its stored real path. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => {
  const ipcMain = {
    on: vi.fn(() => ipcMain),
    removeListener: vi.fn(() => ipcMain),
    emit: vi.fn(() => true)
  }
  return {
    BrowserWindow: { fromId: vi.fn((): unknown => null) },
    webContents: { fromId: vi.fn((): unknown => null) },
    ipcMain,
    app: { getPath: vi.fn(() => '/tmp'), isPackaged: false }
  }
})
vi.mock('electron', () => electronMocks)

const listWorktreesStrictMock = vi.hoisted(() => vi.fn())
vi.mock('../git/worktree', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listWorktreesStrict: listWorktreesStrictMock
}))

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'
import { OrcaRuntimeService } from './orca-runtime'

function makeStore(repoPath: string) {
  const repos = [
    {
      id: 'repo-local',
      path: repoPath,
      displayName: 'local',
      badgeColor: 'blue',
      addedAt: 1
    }
  ]
  const store = {
    getRepo: (id: string) => repos.find((repo) => repo.id === id),
    getRepos: () => repos,
    getAllWorktreeMeta: vi.fn(() => ({})),
    getWorktreeMeta: () => undefined,
    setWorktreeMeta: vi.fn(),
    removeWorktreeMeta: () => {},
    getAllWorktreeLineage: () => ({}),
    getAllWorkspaceLineage: () => ({}),
    removeWorktreeLineage: vi.fn(),
    removeWorkspaceLineage: vi.fn(),
    getGitHubCache: () => undefined as never,
    getSettings: () => ({
      workspaceDir: '/tmp/workspaces',
      nestWorkspaces: false,
      refreshLocalBaseRefOnWorktreeCreate: false,
      branchPrefix: 'none',
      branchPrefixCustom: ''
    }),
    getProjects: () => []
  }
  return store
}

let root: string
let realRepo: string
let linkedRepo: string

beforeEach(() => {
  listWorktreesStrictMock.mockReset()
  root = realpathSync(mkdtempSync(join(tmpdir(), 'prompt-selector-realpath-')))
  realRepo = join(root, 'git', 'repo')
  mkdirSync(realRepo, { recursive: true })
  mkdirSync(join(root, 'Desktop'))
  symlinkSync(join(root, 'git'), join(root, 'Desktop', 'git'))
  linkedRepo = join(root, 'Desktop', 'git', 'repo')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function makeRuntime(storedPath: string): OrcaRuntimeService {
  listWorktreesStrictMock.mockImplementation(async (repoPath: string) =>
    repoPath === storedPath
      ? [{ path: storedPath, head: 'abc', branch: 'main', isBare: false, isMainWorktree: true }]
      : []
  )
  return new OrcaRuntimeService(makeStore(storedPath) as never)
}

describe('path selectors compare real paths when the spelling differs', () => {
  it('finds a workspace stored through a symlink by its real path', async () => {
    const runtime = makeRuntime(linkedRepo)
    await expect(runtime.showManagedWorktree(`path:${realRepo}`)).resolves.toMatchObject({
      path: linkedRepo
    })
  })

  it('finds a workspace stored by its real path through a symlink', async () => {
    const runtime = makeRuntime(realRepo)
    await expect(runtime.showManagedWorktree(`path:${linkedRepo}`)).resolves.toMatchObject({
      path: realRepo
    })
  })

  it('still reports a path that is not a workspace', async () => {
    const runtime = makeRuntime(realRepo)
    await expect(runtime.showManagedWorktree(`path:${root}`)).rejects.toThrow('selector_not_found')
  })
})
