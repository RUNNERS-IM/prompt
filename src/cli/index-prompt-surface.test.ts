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

function terminal(handle: string, overrides: Record<string, unknown> = {}) {
  return {
    handle,
    worktreeId: `${REPOS[2].id}::/tmp/web`,
    worktreePath: '/tmp/web',
    branch: 'main',
    tabId: 'tab-1',
    leafId: 'leaf-1',
    title: 'zsh',
    connected: true,
    writable: true,
    lastOutputAt: null,
    preview: 'SECRET PREVIEW TEXT',
    ...overrides
  }
}

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

describe('prompt command surface', () => {
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

  it('keeps an old command working with one stderr notice and unchanged stdout', async () => {
    routeCalls({ 'repo.list': { repos: REPOS } })
    const embedded = await run(['repo', 'list', '--json'], null)
    const aliased = await run(['repo', 'list', '--json'], 'orca')

    expect(embedded.stderr).toBe('')
    expect(aliased.stdout).toBe(embedded.stdout)
    expect(aliased.stderr.trim().split('\n')).toEqual([
      '[notice] This command was renamed: prompt project list (the old name is removed in 2.7)'
    ])
    expect(JSON.parse(aliased.stdout).result.repos).toHaveLength(3)
  })

  it('writes the notice in Korean when the locale is Korean', async () => {
    process.env.LANG = 'ko_KR.UTF-8'
    routeCalls({ 'repo.list': { repos: REPOS } })
    const { stderr } = await run(['worktree', 'list', '--json'], 'orca')

    expect(stderr).toContain('[알림] 이 명령은 이름이 바뀌었습니다: prompt workspace list')
  })

  it('also accepts old paths under the prompt executable', async () => {
    routeCalls({ 'repo.list': { repos: REPOS } })
    const { stdout, stderr } = await run(['repo', 'list', '--json'], 'prompt')

    expect(stderr).toContain('prompt project list')
    expect(JSON.parse(stdout).result.repos).toHaveLength(3)
  })

  it('prints new lists as result.items with id and name', async () => {
    routeCalls({ 'repo.list': { repos: REPOS } })
    const { stdout, stderr } = await run(['project', 'list', '--json'], 'prompt')

    expect(stderr).toBe('')
    const parsed = JSON.parse(stdout)
    expect(parsed.ok).toBe(true)
    expect(parsed.result.items.map((item: { id: string; name: string }) => item.name)).toEqual([
      'api',
      'api',
      'web'
    ])
    expect(parsed.result.items[0]).toMatchObject({ id: REPOS[0].id, kind: 'git', path: '/tmp/api' })
  })

  it('prints a human table with a header and short ids', async () => {
    routeCalls({ 'repo.list': { repos: REPOS } })
    const { stdout } = await run(['project', 'list'], 'prompt')
    const lines = stdout.trim().split('\n')

    expect(lines[0]).toMatch(/^ID\s+NAME\s+KIND\s+PATH$/)
    expect(lines[3]).toMatch(/^f9e8d7c6\s+web\s+git\s+\/tmp\/web$/)
  })

  it('refuses an ambiguous name and lists the candidates', async () => {
    routeCalls({ 'repo.list': { repos: REPOS } })
    const { stdout } = await run(['project', 'show', 'api', '--json'], 'prompt')

    expect(process.exitCode).toBe(1)
    const parsed = JSON.parse(stdout)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('ambiguous')
    expect(parsed.error.message).toContain('a1b2c3d4  api')
    expect(callMock).not.toHaveBeenCalledWith('repo.show', expect.anything())
  })

  it('resolves a short id prefix to the full id', async () => {
    routeCalls({ 'repo.list': { repos: REPOS }, 'repo.show': { repo: REPOS[2] } })
    const { stdout } = await run(['project', 'show', 'f9e8d7', '--json'], 'prompt')

    expect(JSON.parse(stdout).result.project.name).toBe('web')
    expect(callMock).toHaveBeenCalledWith('repo.show', { repo: `id:${REPOS[2].id}` })
  })

  it('does not treat a prefix shorter than six characters as an id', async () => {
    routeCalls({ 'repo.list': { repos: REPOS }, 'repo.show': { repo: REPOS[2] } })
    await run(['project', 'show', 'f9e8', '--json'], 'prompt')

    expect(callMock).toHaveBeenCalledWith('repo.show', { repo: 'f9e8' })
  })

  it('translates --project into the selector a moved command reads', async () => {
    routeCalls({
      'repo.list': { repos: REPOS },
      'repo.searchRefs': { refs: [], truncated: false }
    })
    await run(['project', 'refs', '--project', 'web', '--query', 'main', '--json'], 'prompt')

    expect(callMock).toHaveBeenCalledWith(
      'repo.searchRefs',
      expect.objectContaining({ repo: `id:${REPOS[2].id}`, query: 'main' })
    )
  })

  it('keeps the selector id on workspace items and shows the instance short id', async () => {
    routeCalls({
      'repo.list': { repos: REPOS },
      'worktree.list': {
        worktrees: [
          {
            id: `${REPOS[2].id}::/tmp/web`,
            repoId: REPOS[2].id,
            path: '/tmp/web',
            branch: 'main',
            displayName: 'web',
            identity: { key: 'wt2:local:5e6f7a8b-instance' }
          }
        ],
        totalCount: 1,
        truncated: false
      }
    })
    const json = await run(['workspace', 'list', '--json'], 'prompt')
    const human = await run(['workspace', 'list'], 'prompt')

    expect(JSON.parse(json.stdout).result.items[0]).toMatchObject({
      id: `${REPOS[2].id}::/tmp/web`,
      identity: 'wt2:local:5e6f7a8b-instance',
      name: 'web',
      project: { id: REPOS[2].id, name: 'web' }
    })
    expect(human.stdout.split('\n')[1]).toMatch(/^5e6f7a8b\s+web\s+web\s+main\s+\/tmp\/web$/)
  })

  it('lists terminals without their screen content', async () => {
    routeCalls({
      'repo.list': { repos: REPOS },
      'terminal.list': {
        terminals: [terminal('term_0123456789abcdef0123')],
        totalCount: 1,
        truncated: false
      }
    })
    const human = await run(['terminal', 'list'], 'prompt')
    const json = await run(['terminal', 'list', '--json'], 'prompt')

    expect(human.stdout).not.toContain('SECRET PREVIEW TEXT')
    expect(json.stdout).not.toContain('SECRET PREVIEW TEXT')
    expect(human.stdout.split('\n')[1]).toMatch(/^01234567\s+zsh\s+web\s+/)
    expect(JSON.parse(json.stdout).result.items[0]).toMatchObject({
      id: 'term_0123456789abcdef0123',
      name: 'zsh',
      project: { id: REPOS[2].id, name: 'web' },
      state: 'running'
    })
  })

  it('refuses to move a session with not_supported and changes nothing', async () => {
    routeCalls({
      'worktree.list': { worktrees: [], totalCount: 0, truncated: false },
      'terminal.list': {
        terminals: [
          terminal('term_0123456789abcdef0123', { agentIdentity: 'claude', paneTitle: 'fix login' })
        ],
        totalCount: 1,
        truncated: false
      }
    })
    const { stdout } = await run(
      ['session', 'move', 'fix login', '--workspace', 'other', '--json'],
      'prompt'
    )

    expect(JSON.parse(stdout).error.code).toBe('not_supported')
    // Only reads: the target selector and the session lookup.
    expect(callMock.mock.calls.map(([method]) => method)).toEqual([
      'worktree.list',
      'terminal.list'
    ])
  })

  it('keeps root help short and lists every group', async () => {
    const { stdout } = await run(['--help'], 'prompt')
    const lines = stdout.trim().split('\n')

    expect(lines.length).toBeLessThanOrEqual(45)
    for (const group of [
      'app',
      'project',
      'workspace',
      'session',
      'terminal',
      'browser',
      'computer',
      'emulator',
      'connect',
      'automation',
      'orchestration',
      'skill',
      'account',
      'env',
      'util'
    ]) {
      expect(stdout).toMatch(new RegExp(`^\\s+${group}\\s`, 'm'))
    }
  })

  it('keeps legacy help for the orca executable', async () => {
    const { stdout } = await run(['--help'], 'orca')

    expect(stdout).toContain('orca')
    expect(stdout).not.toMatch(/^\s+workspace\s/m)
  })
})
