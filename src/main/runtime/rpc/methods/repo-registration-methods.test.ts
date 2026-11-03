import '../unused-default-rpc-methods.test-fixture'
import { describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { Repo } from '../../../../shared/repo-types'
import { makeRequest, repoDispatcher } from './repo-rpc.test-fixture'

const repo: Repo = {
  id: 'repo-1',
  path: '/Users/me/Desktop/git/app',
  displayName: 'app',
  badgeColor: '#737373',
  addedAt: 1,
  kind: 'git'
}

describe('repo registration RPC methods', () => {
  it('adds alreadyRegistered when the folder is a project under another path', async () => {
    const addRepoWithOutcome = vi.fn<OrcaRuntimeService['addRepoWithOutcome']>().mockResolvedValue({
      repo,
      existingPath: repo.path,
      requestedPath: '/Users/me/git/app'
    })
    const dispatcher = repoDispatcher({ getRuntimeId: () => 'test-runtime', addRepoWithOutcome })

    const response = await dispatcher.dispatch(
      makeRequest('repo.add', { path: '/Users/me/git/app', kind: 'git' })
    )

    expect(addRepoWithOutcome).toHaveBeenCalledWith(
      '/Users/me/git/app',
      'git',
      undefined,
      undefined
    )
    expect(response).toMatchObject({
      ok: true,
      result: {
        repo: { id: 'repo-1', path: repo.path },
        alreadyRegistered: { path: repo.path, requestedPath: '/Users/me/git/app' }
      }
    })
  })

  it('keeps the plain repo.add result for a new project', async () => {
    const addRepoWithOutcome = vi
      .fn<OrcaRuntimeService['addRepoWithOutcome']>()
      .mockResolvedValue({ repo })
    const dispatcher = repoDispatcher({ getRuntimeId: () => 'test-runtime', addRepoWithOutcome })

    const response = await dispatcher.dispatch(makeRequest('repo.add', { path: repo.path }))

    expect(response).toMatchObject({ ok: true, result: { repo: { id: 'repo-1' } } })
    expect((response as { result: object }).result).not.toHaveProperty('alreadyRegistered')
  })

  it('relocates a project and returns what was kept', async () => {
    const relocateRepo = vi.fn<OrcaRuntimeService['relocateRepo']>().mockResolvedValue({
      repo: { ...repo, path: '/Users/me/git/app' },
      previousPath: repo.path,
      moved: true,
      worktreeCount: 2,
      sessionTabCount: 4
    })
    const dispatcher = repoDispatcher({ getRuntimeId: () => 'test-runtime', relocateRepo })

    const response = await dispatcher.dispatch(
      makeRequest('repo.relocate', { repo: 'id:repo-1', path: '/Users/me/git/app' })
    )

    expect(relocateRepo).toHaveBeenCalledWith('id:repo-1', '/Users/me/git/app')
    expect(response).toMatchObject({
      ok: true,
      result: {
        repo: { id: 'repo-1', path: '/Users/me/git/app' },
        previousPath: repo.path,
        moved: true,
        worktreeCount: 2,
        sessionTabCount: 4
      }
    })
  })

  it('rejects repo.relocate without a path', async () => {
    const relocateRepo = vi.fn<OrcaRuntimeService['relocateRepo']>()
    const dispatcher = repoDispatcher({ getRuntimeId: () => 'test-runtime', relocateRepo })

    const response = await dispatcher.dispatch(makeRequest('repo.relocate', { repo: 'id:repo-1' }))

    expect(response).toMatchObject({ ok: false })
    expect(relocateRepo).not.toHaveBeenCalled()
  })
})
