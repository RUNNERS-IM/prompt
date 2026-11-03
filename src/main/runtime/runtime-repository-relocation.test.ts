import { runProcessSync } from '@orca/process-host'
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultWorkspaceSession } from '../../shared/constants'
import type { Repo } from '../../shared/repo-types'
import { hostWorktreeTarget } from '../../shared/worktree/host-qualified-identity'
import {
  closeTestStores,
  createStore,
  makeRepo,
  testState
} from '../persistence/persistence-test-harness'
import { makeTerminalTab } from '../persistence/persistence-session-fixtures'
import type { Store } from '../persistence'
import {
  relocateRepository,
  type RepoRelocationDependencies
} from './runtime-repository-relocation'

vi.mock('../ssh/config/ssh-config-parser', () => ({
  loadUserSshConfig: vi.fn(),
  sshConfigHostsToTargets: vi.fn()
}))
vi.mock('electron', () => ({
  app: { getPath: () => testState.dir },
  safeStorage: { isEncryptionAvailable: () => false }
}))
vi.mock('../telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../telemetry/cohort-classifier', () => ({
  getCohortAtEmit: vi.fn().mockReturnValue({})
}))

const dirLinkType = process.platform === 'win32' ? 'junction' : 'dir'

function runGit(args: string[]): void {
  const result = runProcessSync({ program: 'git', args })
  if (result.code !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  }
}

function harness(store: Store): {
  deps: RepoRelocationDependencies
  renamed: [string, string][]
  reposChanged: ReturnType<typeof vi.fn>
} {
  const renamed: [string, string][] = []
  const reposChanged = vi.fn()
  const deps: RepoRelocationDependencies = {
    getStore: () => store,
    resolveRepo: async (selector) => {
      const repo = store.getRepos().find((candidate) => candidate.id === selector)
      if (!repo) {
        throw new Error('repo_not_found')
      }
      return repo
    },
    invalidateResolvedWorktrees: vi.fn(),
    invalidateWorktreeScan: vi.fn(),
    notifyReposChanged: reposChanged,
    notifyWorktreeRenamed: (_repoId, oldId, newId) => renamed.push([oldId, newId])
  }
  return { deps, renamed, reposChanged }
}

describe('relocateRepository', () => {
  let root: string
  let realRepo: string
  let aliasRepo: string

  beforeEach(async () => {
    testState.dir = await mkdtemp(join(tmpdir(), 'orca-relocate-store-'))
    // Why realpath: macOS tmpdir is itself a symlink, and git reports the resolved toplevel.
    root = await realpath(await mkdtemp(join(tmpdir(), 'orca-relocate-')))
    realRepo = join(root, 'git', 'app')
    await mkdir(realRepo, { recursive: true })
    runGit(['init', '-q', realRepo])
    await mkdir(join(root, 'Desktop'))
    await symlink(join(root, 'git'), join(root, 'Desktop', 'git'), dirLinkType)
    aliasRepo = join(root, 'Desktop', 'git', 'app')
  })

  afterEach(async () => {
    await closeTestStores()
    await rm(root, { recursive: true, force: true })
    await rm(testState.dir, { recursive: true, force: true })
  })

  function seedAliasProject(store: Store, overrides: Partial<Repo> = {}): Repo {
    const repo = makeRepo({
      id: 'app-id',
      path: aliasRepo,
      displayName: 'App',
      badgeColor: '#22c55e',
      worktreeBaseRef: 'origin/main',
      hookSettings: { mode: 'auto', scripts: { setup: 'pnpm i', archive: '' } },
      importedExternalWorktreePaths: [join(aliasRepo, '.worktrees', 'feature')],
      kind: 'git',
      ...overrides
    })
    store.addRepo(repo)
    return repo
  }

  it('moves the path and carries worktree state, keeping id and settings', async () => {
    const store = createStore()
    const repo = seedAliasProject(store)
    const mainId = `${repo.id}::${aliasRepo}`
    const linkedId = `${repo.id}::${join(aliasRepo, '.worktrees', 'feature')}`
    const outsideId = `${repo.id}::${join(root, 'elsewhere', 'feature')}`
    store.setWorktreeMeta(hostWorktreeTarget({ id: mainId, hostId: 'local' }), {
      displayName: 'Main work'
    })
    store.setWorktreeMeta(hostWorktreeTarget({ id: linkedId, hostId: 'local' }), {
      comment: 'linked'
    })
    store.setWorkspaceSession(
      {
        ...getDefaultWorkspaceSession(),
        activeWorktreeId: linkedId,
        tabsByWorktree: {
          [mainId]: [
            makeTerminalTab({ id: 'main-1', worktreeId: mainId }),
            makeTerminalTab({ id: 'main-2', worktreeId: mainId })
          ],
          [linkedId]: [makeTerminalTab({ id: 'linked-1', worktreeId: linkedId })],
          [outsideId]: [makeTerminalTab({ id: 'outside-1', worktreeId: outsideId })]
        }
      },
      'local'
    )
    const { deps, renamed, reposChanged } = harness(store)

    const result = await relocateRepository(deps, repo.id, realRepo)

    const newMainId = `${repo.id}::${realRepo}`
    const newLinkedId = `${repo.id}::${join(realRepo, '.worktrees', 'feature')}`
    expect(result).toMatchObject({
      previousPath: aliasRepo,
      moved: true,
      worktreeCount: 2,
      sessionTabCount: 3
    })
    expect(store.getRepo(repo.id)).toMatchObject({
      id: 'app-id',
      path: realRepo,
      displayName: 'App',
      badgeColor: '#22c55e',
      worktreeBaseRef: 'origin/main',
      hookSettings: { mode: 'auto', scripts: { setup: 'pnpm i', archive: '' } },
      importedExternalWorktreePaths: [join(realRepo, '.worktrees', 'feature')]
    })
    expect(store.getRepos()).toHaveLength(1)
    const meta = store.getAllWorktreeMetaForHost('local')
    expect(meta[newMainId]?.displayName).toBe('Main work')
    expect(meta[newLinkedId]?.comment).toBe('linked')
    expect(meta[mainId]).toBeUndefined()
    const session = store.getWorkspaceSession('local')
    expect(session.tabsByWorktree[newMainId]?.map((tab) => tab.id)).toEqual(['main-1', 'main-2'])
    expect(session.tabsByWorktree[newLinkedId]?.[0]?.worktreeId).toBe(newLinkedId)
    expect(session.tabsByWorktree[outsideId]).toHaveLength(1)
    expect(session.tabsByWorktree[mainId]).toBeUndefined()
    expect(session.activeWorktreeId).toBe(newLinkedId)
    expect(renamed).toEqual(
      expect.arrayContaining([
        [mainId, newMainId],
        [linkedId, newLinkedId]
      ])
    )
    expect(reposChanged).toHaveBeenCalledOnce()
  })

  it('reports no change when the project already uses that path', async () => {
    const store = createStore()
    const repo = seedAliasProject(store, { path: realRepo })
    const { deps, reposChanged } = harness(store)

    const result = await relocateRepository(deps, repo.id, realRepo)

    expect(result).toMatchObject({ moved: false, worktreeCount: 0, sessionTabCount: 0 })
    expect(reposChanged).not.toHaveBeenCalled()
  })

  it('refuses a folder that is not a git repository', async () => {
    const store = createStore()
    const repo = seedAliasProject(store)
    const plain = join(root, 'plain')
    await mkdir(plain)
    const { deps } = harness(store)

    await expect(relocateRepository(deps, repo.id, plain)).rejects.toThrow(
      'Not a valid git repository'
    )
    expect(store.getRepo(repo.id)?.path).toBe(aliasRepo)
  })

  it('refuses a path that does not exist', async () => {
    const store = createStore()
    const repo = seedAliasProject(store)
    const { deps } = harness(store)

    await expect(relocateRepository(deps, repo.id, join(root, 'missing'))).rejects.toThrow(
      'Path does not exist'
    )
  })

  it('refuses a different checkout of the same repository', async () => {
    const store = createStore()
    const repo = seedAliasProject(store)
    const clone = join(root, 'clone')
    runGit(['clone', '-q', realRepo, clone])
    const { deps } = harness(store)

    await expect(relocateRepository(deps, repo.id, clone)).rejects.toThrow(
      'is a different folder than'
    )
    expect(store.getRepo(repo.id)?.path).toBe(aliasRepo)
  })

  it('refuses a path another project already uses', async () => {
    const store = createStore()
    const repo = seedAliasProject(store)
    store.addRepo(makeRepo({ id: 'dup-id', path: realRepo, displayName: 'Dup', kind: 'git' }))
    const { deps } = harness(store)

    await expect(relocateRepository(deps, repo.id, realRepo)).rejects.toThrow(
      'is already used by the project Dup (dup-id)'
    )
    expect(store.getRepo(repo.id)?.path).toBe(aliasRepo)
  })

  it('refuses a folder project', async () => {
    const store = createStore()
    const repo = seedAliasProject(store, { kind: 'folder' })
    const { deps } = harness(store)

    await expect(relocateRepository(deps, repo.id, realRepo)).rejects.toThrow(
      'Only git projects can be moved'
    )
  })
})
