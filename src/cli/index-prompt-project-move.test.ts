import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  callMock,
  runtimeClientConstructorMock,
  serveOrcaAppMock,
  getDefaultUserDataPathMock,
  addEnvironmentFromPairingCodeMock,
  listEnvironmentsMock,
  spawnMock
} = vi.hoisted(() => ({
  callMock: vi.fn(),
  runtimeClientConstructorMock: vi.fn(),
  serveOrcaAppMock: vi.fn(),
  getDefaultUserDataPathMock: vi.fn(() => '/tmp/orca-user-data'),
  addEnvironmentFromPairingCodeMock: vi.fn(),
  listEnvironmentsMock: vi.fn(),
  spawnMock: vi.fn()
}))

vi.mock('./runtime-client', async () => {
  const { createRuntimeClientModuleMock } = await import('./index-test-harness.js')
  return createRuntimeClientModuleMock({
    callMock,
    runtimeClientConstructorMock,
    serveOrcaAppMock,
    getDefaultUserDataPathMock
  })
})

vi.mock('./runtime/environments', () => ({
  addEnvironmentFromPairingCode: addEnvironmentFromPairingCodeMock,
  listEnvironments: listEnvironmentsMock,
  removeEnvironment: vi.fn(),
  resolveEnvironment: vi.fn()
}))

vi.mock('child_process', async () => {
  const { createChildProcessModuleMock } = await import('./index-test-harness.js')
  return createChildProcessModuleMock(spawnMock)
})

import { main } from './index'
import { useWorktreeAwarenessEnvironment } from './index-test-harness'
import { okFixture } from './test-fixtures'

const ORIGINAL_EXIT_CODE = process.exitCode
const ORIGINAL_LANG = process.env.LANG
const ORIGINAL_LC_ALL = process.env.LC_ALL

function repo(id: string, displayName: string, path: string) {
  return { id, displayName, path, kind: 'git', badgeColor: '#737373' }
}

const REPOS = [
  repo('a1b2c3d4-0000-4000-8000-000000000001', 'api', '/tmp/api'),
  repo('a1b2c3d4-0000-4000-8000-000000000002', 'api', '/tmp/api-copy'),
  repo('f9e8d7c6-0000-4000-8000-000000000003', 'web', '/tmp/web')
]

function answer(method: string, result: unknown) {
  return okFixture(`req_${method}`, result)
}

function routeCalls(routes: Record<string, unknown>): void {
  callMock.mockImplementation(async (method: string) => {
    if (!(method in routes)) {
      throw new Error(`unexpected RPC ${method}`)
    }
    return answer(method, routes[method])
  })
}

type Captured = { stdout: string; stderr: string }

async function run(argv: string[], executable: 'prompt' | 'orca' | null): Promise<Captured> {
  const out: string[] = []
  const err: string[] = []
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
    out.push(args.join(' '))
  })
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    err.push(args.join(' '))
  })
  const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    out.push(String(chunk))
    return true
  })
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    err.push(String(chunk))
    return true
  })
  try {
    await main(argv, '/tmp', executable)
  } finally {
    logSpy.mockRestore()
    errorSpy.mockRestore()
    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
  }
  return { stdout: out.join('\n'), stderr: err.join('') }
}

describe('prompt project move', () => {
  useWorktreeAwarenessEnvironment({
    callMock,
    serveOrcaAppMock,
    getDefaultUserDataPathMock,
    addEnvironmentFromPairingCodeMock,
    listEnvironmentsMock,
    spawnMock
  })

  beforeEach(() => {
    process.env.LANG = 'en_US.UTF-8'
    delete process.env.LC_ALL
  })

  afterEach(() => {
    process.exitCode = ORIGINAL_EXIT_CODE
    process.env.LANG = ORIGINAL_LANG
    if (ORIGINAL_LC_ALL === undefined) {
      delete process.env.LC_ALL
    } else {
      process.env.LC_ALL = ORIGINAL_LC_ALL
    }
  })

  it('moves a project to the new path and reports what it kept', async () => {
    routeCalls({
      'repo.list': { repos: REPOS },
      'repo.relocate': {
        repo: { ...REPOS[2], path: '/tmp/git/web' },
        previousPath: '/tmp/web',
        moved: true,
        worktreeCount: 3,
        sessionTabCount: 1
      }
    })
    const { stdout } = await run(['project', 'move', 'web', '/tmp/git/web'], 'prompt')

    expect(callMock).toHaveBeenCalledWith('repo.relocate', {
      repo: `id:${REPOS[2].id}`,
      path: '/tmp/git/web'
    })
    expect(stdout.trim()).toBe('Moved web to /tmp/git/web. Kept 3 worktrees and 1 session tab.')
  })

  it('prints the move counts under --json', async () => {
    routeCalls({
      'repo.list': { repos: REPOS },
      'repo.relocate': {
        repo: { ...REPOS[2], path: '/tmp/git/web' },
        previousPath: '/tmp/web',
        moved: true,
        worktreeCount: 1,
        sessionTabCount: 0
      }
    })
    const { stdout } = await run(['project', 'move', 'f9e8d7', '/tmp/git/web', '--json'], 'prompt')

    expect(JSON.parse(stdout).result).toMatchObject({
      project: { id: REPOS[2].id, name: 'web', path: '/tmp/git/web' },
      previousPath: '/tmp/web',
      moved: true,
      worktreeCount: 1,
      sessionTabCount: 0
    })
  })

  it('says so when the project already uses the path', async () => {
    routeCalls({
      'repo.list': { repos: REPOS },
      'repo.relocate': {
        repo: REPOS[2],
        previousPath: '/tmp/web',
        moved: false,
        worktreeCount: 0,
        sessionTabCount: 0
      }
    })
    const { stdout } = await run(['project', 'move', 'web', '/tmp/web'], 'prompt')

    expect(stdout.trim()).toBe('web (f9e8d7c6) is already at /tmp/web.')
  })

  it('points project add at project move when the folder is registered under another path', async () => {
    routeCalls({
      'repo.add': {
        repo: REPOS[2],
        alreadyRegistered: { path: '/tmp/web', requestedPath: '/tmp/git/web' }
      }
    })
    const human = await run(['project', 'add', '/tmp/git/web'], 'prompt')

    expect(human.stdout).toContain(
      `Already registered as /tmp/web (id ${REPOS[2].id}). To change its path: prompt project move ${REPOS[2].id} /tmp/git/web`
    )

    const json = await run(['project', 'add', '/tmp/git/web', '--json'], 'prompt')
    expect(JSON.parse(json.stdout).result).toEqual({
      project: expect.objectContaining({ id: REPOS[2].id, path: '/tmp/web' }),
      alreadyRegistered: { path: '/tmp/web', requestedPath: '/tmp/git/web' }
    })
  })

  it('keeps project add output unchanged for a new project', async () => {
    routeCalls({ 'repo.add': { repo: REPOS[2] } })
    const human = await run(['project', 'add', '/tmp/web'], 'prompt')
    expect(human.stdout).not.toContain('Already registered')

    const json = await run(['project', 'add', '/tmp/web', '--json'], 'prompt')
    expect(Object.keys(JSON.parse(json.stdout).result)).toEqual(['project'])
  })
})
