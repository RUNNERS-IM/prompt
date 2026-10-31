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
import { RuntimeClientError } from './runtime/types'
import { okFixture } from './test-fixtures'

const ORIGINAL_EXIT_CODE = process.exitCode
const ORIGINAL_LANG = process.env.LANG

const API_ID = 'a1b2c3d4-0000-4000-8000-000000000001'
const WEB_ID = 'f9e8d7c6-0000-4000-8000-000000000003'
const WEB_SSH_ID = 'b7c8d9e0-0000-4000-8000-000000000004'

const REPOS = [
  { id: API_ID, displayName: 'api', path: '/tmp/api', kind: 'folder', badgeColor: '#737373' },
  { id: WEB_ID, displayName: 'web', path: '/tmp/web', kind: 'git', badgeColor: '#737373' },
  {
    id: WEB_SSH_ID,
    displayName: 'web',
    path: '/srv/web',
    kind: 'git',
    badgeColor: '#737373',
    connectionId: 'gpu'
  }
]

function project(id: string, displayName: string, sourceRepoIds: string[]) {
  return { id, displayName, badgeColor: '#737373', sourceRepoIds, createdAt: 1, updatedAt: 1 }
}

// A folder (host-local id), a GitHub repo cloned on two hosts, and a project with no repo left.
const PROJECTS = [
  project(`repo:${API_ID}`, 'api', [API_ID]),
  project('github:acme/web', 'web', [WEB_ID, WEB_SSH_ID]),
  project('github:acme/docs', 'docs', [])
]

function setup(
  projectId: string,
  hostId: string,
  repoId: string,
  path: string,
  setupState = 'ready'
) {
  return {
    id: repoId || `${projectId}::${hostId}`,
    projectId,
    hostId,
    repoId,
    path,
    displayName: projectId,
    setupState,
    setupMethod: repoId ? 'legacy-repo' : 'provisioned',
    createdAt: 1,
    updatedAt: 1
  }
}

const SETUPS = [
  setup(`repo:${API_ID}`, 'local', API_ID, '/tmp/api'),
  setup('github:acme/web', 'local', WEB_ID, '/tmp/web'),
  setup('github:acme/web', 'ssh:gpu', WEB_SSH_ID, '/srv/web'),
  setup('github:acme/web', 'runtime:env-1', '', '', 'not-set-up'),
  setup('github:acme/docs', 'ssh:gpu', '', '/srv/docs', 'setting-up')
]

const CATALOG = {
  'repo.list': { repos: REPOS },
  'project.list': { projects: PROJECTS },
  'projectHostSetup.list': { setups: SETUPS },
  'ssh.listTargetSummaries': { targets: [{ id: 'gpu', label: 'gpu-box' }] }
}

function routeCalls(routes: Record<string, unknown>): void {
  callMock.mockImplementation(async (method: string) => {
    if (!(method in routes)) {
      throw new Error(`unexpected RPC ${method}`)
    }
    return okFixture(`req_${method}`, routes[method])
  })
}

async function run(
  argv: string[],
  executable: 'prompt' | 'orca'
): Promise<{ stdout: string; stderr: string }> {
  const out: string[] = []
  const err: string[] = []
  const spies = [
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      out.push(args.join(' '))
    }),
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      err.push(args.join(' '))
    }),
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      out.push(String(chunk))
      return true
    }),
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      err.push(String(chunk))
      return true
    })
  ]
  try {
    await main(argv, '/tmp', executable)
  } finally {
    spies.forEach((spy) => spy.mockRestore())
  }
  return { stdout: out.join('\n'), stderr: err.join('') }
}

describe('prompt project list merged with durable projects', () => {
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
    listEnvironmentsMock.mockReturnValue([{ id: 'env-1', name: 'studio' }])
  })

  afterEach(() => {
    process.exitCode = ORIGINAL_EXIT_CODE
    process.env.LANG = ORIGINAL_LANG
  })

  it('adds the project id and every host each project is set up on', async () => {
    routeCalls(CATALOG)
    const { stdout } = await run(['project', 'list', '--json'], 'prompt')
    const items = JSON.parse(stdout).result.items

    expect(items.map((item: { id: string }) => item.id)).toEqual([
      API_ID,
      WEB_ID,
      WEB_SSH_ID,
      'github:acme/docs'
    ])
    expect(items[0]).toMatchObject({
      projectId: `repo:${API_ID}`,
      hosts: [{ id: 'local', name: 'this machine', state: 'ready' }]
    })
    expect(items[1]).toMatchObject({
      projectId: 'github:acme/web',
      hosts: [
        { id: 'local', name: 'this machine', state: 'ready' },
        { id: 'runtime:env-1', name: 'studio', state: 'not-set-up' }
      ]
    })
    expect(items[2].hosts[0]).toEqual({ id: 'ssh:gpu', name: 'gpu-box', state: 'ready' })
    expect(items[3]).toMatchObject({
      name: 'docs',
      projectId: 'github:acme/docs',
      path: '/srv/docs',
      hosts: [{ id: 'ssh:gpu', name: 'gpu-box', state: 'setting-up' }]
    })
  })

  it('joins several hosts in one HOST cell and marks hosts that are not ready', async () => {
    routeCalls(CATALOG)
    const { stdout } = await run(['project', 'list'], 'prompt')
    const lines = stdout.trim().split('\n')

    expect(lines[0]).toMatch(/^ID\s+NAME\s+KIND\s+HOST\s+PATH$/)
    expect(lines[1]).toMatch(/^a1b2c3d4\s+api\s+folder\s+this machine\s+\/tmp\/api$/)
    expect(lines[2]).toMatch(/^f9e8d7c6\s+web\s+git\s+this machine, studio \(not set up\)\s+/)
    expect(lines[3]).toMatch(/^b7c8d9e0\s+web\s+git\s+gpu-box, studio \(not set up\)\s+/)
    expect(lines[4]).toMatch(/^github:acme\/docs\s+docs\s+git\s+gpu-box \(setting up\)\s+/)
  })

  it('writes host words in Korean when the locale is Korean', async () => {
    process.env.LANG = 'ko_KR.UTF-8'
    routeCalls(CATALOG)
    const { stdout } = await run(['project', 'list'], 'prompt')

    expect(stdout).toMatch(/^ID\s+이름\s+종류\s+호스트\s+경로$/m)
    expect(stdout).toContain('이 컴퓨터, studio (설정 안 됨)')
  })

  it('falls back to each repo host on a host without the durable catalog', async () => {
    callMock.mockImplementation(async (method: string) => {
      if (method === 'project.list' || method === 'projectHostSetup.list') {
        throw new RuntimeClientError('method_not_found', `Unknown method: ${method}`)
      }
      return okFixture(`req_${method}`, CATALOG[method as keyof typeof CATALOG])
    })
    const { stdout } = await run(['project', 'list', '--json'], 'prompt')
    const items = JSON.parse(stdout).result.items

    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ projectId: null, hosts: [{ id: 'local' }] })
    expect(items[2].hosts).toEqual([{ id: 'ssh:gpu', name: 'gpu-box', state: 'ready' }])
  })

  it('resolves a repo:<id> project id to its sidebar repo', async () => {
    routeCalls({ ...CATALOG, 'repo.show': { repo: REPOS[0] } })
    await run(['project', 'show', `repo:${API_ID}`, '--json'], 'prompt')

    expect(callMock).toHaveBeenCalledWith('repo.show', { repo: `id:${API_ID}` })
  })

  it('refuses a project id that holds several repos and lists them', async () => {
    routeCalls(CATALOG)
    const { stdout } = await run(['project', 'show', 'github:acme/web', '--json'], 'prompt')
    const { error } = JSON.parse(stdout)

    expect(error.code).toBe('ambiguous')
    expect(error.data.candidates.map((candidate: { id: string }) => candidate.id)).toEqual([
      WEB_ID,
      WEB_SSH_ID
    ])
    expect(callMock).not.toHaveBeenCalledWith('repo.show', expect.anything())
  })

  it('explains that a project with no repo cannot be shown as a sidebar project', async () => {
    routeCalls(CATALOG)
    const { stdout } = await run(['project', 'show', 'docs', '--json'], 'prompt')
    const { error } = JSON.parse(stdout)

    expect(error.code).toBe('not_in_sidebar')
    expect(error.message).toContain('github:acme/docs')
  })

  it('turns a short repo id into the project id that setup commands take, even with --host', async () => {
    routeCalls(CATALOG)
    const { stdout } = await run(
      ['project', 'setup', 'list', '--project', 'f9e8d7', '--host', 'local', '--json'],
      'prompt'
    )
    const { items } = JSON.parse(stdout).result

    expect(items.map((item: { id: string }) => item.id)).toEqual([WEB_ID])
  })

  it('no longer has project setup projects, and keeps the old orca project list output', async () => {
    routeCalls(CATALOG)
    const removed = await run(['project', 'setup', 'projects', '--json'], 'prompt')
    expect(JSON.parse(removed.stdout).ok).toBe(false)

    process.exitCode = ORIGINAL_EXIT_CODE
    const legacy = await run(['project', 'list', '--json'], 'orca')
    expect(JSON.parse(legacy.stdout).result.projects).toEqual(PROJECTS)
    expect(legacy.stderr.trim()).toBe(
      '[notice] This command was renamed: prompt project list (the old name is removed in 2.7)'
    )
  })
})
