import { describe, expect, it, vi } from 'vitest'
import type { RuntimeClient } from '../runtime-client'
import { preResolvePromptSelectors } from './prompt-dispatch'
import { PROMPT_COMMAND_SPECS, rewriteLegacyCommandText } from './prompt-command-specs'
import { COMMAND_SPECS } from '../specs'
import { formatCommandHelp } from '../help'
import { setCliProgramName } from './cli-surface'

const REPO_ID = 'f9e8d7c6-0000-4000-8000-000000000003'
const PROJECTS = [
  {
    id: 'github:acme/web',
    displayName: 'web',
    badgeColor: '#737373',
    sourceRepoIds: [REPO_ID],
    createdAt: 1,
    updatedAt: 1
  }
]

function fakeClient(): { client: RuntimeClient; call: ReturnType<typeof vi.fn> } {
  const call = vi.fn(async (method: string) => {
    if (method !== 'project.list') {
      throw new Error(`unexpected RPC ${method}`)
    }
    return { id: 'req', ok: true, result: { projects: PROJECTS } }
  })
  return { client: { call } as unknown as RuntimeClient, call }
}

function spec(path: string) {
  const found = PROMPT_COMMAND_SPECS.find((candidate) => candidate.path.join(' ') === path)
  if (!found) {
    throw new Error(`no prompt spec ${path}`)
  }
  return found
}

async function resolvedProject(path: string, value: string, hostScoped = false) {
  const { client, call } = fakeClient()
  const flags = new Map<string, string | boolean>([['project', value]])
  await preResolvePromptSelectors(spec(path), flags, () => client, { hostScoped })
  return { project: flags.get('project'), call }
}

describe('durable --project flags under prompt', () => {
  it.each([
    ['automation create', 'f9e8d7'],
    ['automation edit', REPO_ID],
    ['project setup add-folder', 'github:acme/web']
  ])('%s turns %s into the project id', async (path, value) => {
    expect((await resolvedProject(path, value)).project).toBe('github:acme/web')
  })

  it('still resolves with --host, since project ids do not depend on the host', async () => {
    expect((await resolvedProject('project setup add-folder', 'web', true)).project).toBe(
      'github:acme/web'
    )
  })

  it('leaves Linear and Jira --project values alone', async () => {
    for (const path of ['connect jira project types', 'connect linear create']) {
      if (!spec(path).allowedFlags.includes('project')) {
        throw new Error(`${path} lost its --project flag`)
      }
      const { project, call } = await resolvedProject(path, 'web')
      expect(project).toBe('web')
      expect(call).not.toHaveBeenCalled()
    }
  })

  it('names prompt project list where legacy help pointed at orca project list', () => {
    expect(rewriteLegacyCommandText('the display name from `orca project list`.')).toBe(
      'the display name from `prompt project list`.'
    )
    expect(spec('automation create').notes?.join('\n')).toContain('`prompt project list`')
    expect(
      PROMPT_COMMAND_SPECS.some((entry) => entry.path.join(' ') === 'project setup projects')
    ).toBe(false)
  })
})

const OTHER_REPO_ID = 'a1b2c3d4-0000-4000-8000-000000000004'

function workspaceCreateClient(repos: { id: string; displayName: string; path: string }[]) {
  const call = vi.fn(async (method: string) => {
    if (method === 'repo.list') {
      return { id: 'req', ok: true, result: { repos } }
    }
    if (method === 'project.list') {
      return { id: 'req', ok: true, result: { projects: PROJECTS } }
    }
    throw new Error(`unexpected RPC ${method}`)
  })
  return { client: { call } as unknown as RuntimeClient, call }
}

async function workspaceCreateFlags(
  entries: [string, string][],
  repos = [{ id: REPO_ID, displayName: 'web', path: '/src/web' }]
) {
  const { client, call } = workspaceCreateClient(repos)
  const flags = new Map<string, string | boolean>(entries)
  const hostScoped = flags.has('host')
  await preResolvePromptSelectors(spec('workspace create'), flags, () => client, { hostScoped })
  return { flags, call }
}

describe('prompt workspace create --project', () => {
  it.each([
    ['name', 'web'],
    ['short id', 'f9e8d7'],
    ['full repo id', REPO_ID],
    ['project id', 'github:acme/web']
  ])('without --host turns the %s into the local sidebar folder', async (_kind, value) => {
    const { flags } = await workspaceCreateFlags([['project', value]])
    expect(flags.get('repo')).toBe(`id:${REPO_ID}`)
    expect(flags.has('project')).toBe(false)
  })

  it('with --host keeps the durable project id for the host setup path', async () => {
    const { flags, call } = await workspaceCreateFlags([
      ['project', 'web'],
      ['host', 'ssh:box']
    ])
    expect(flags.get('project')).toBe('github:acme/web')
    expect(flags.has('repo')).toBe(false)
    expect(call).not.toHaveBeenCalledWith('repo.list')
  })

  it('leaves --project-host-setup on the durable path', async () => {
    const { flags } = await workspaceCreateFlags([
      ['project', 'web'],
      ['project-host-setup', 'setup-1']
    ])
    expect(flags.get('project')).toBe('github:acme/web')
    expect(flags.has('repo')).toBe(false)
  })

  it('still accepts the hidden --repo flag', async () => {
    const { flags } = await workspaceCreateFlags([['repo', 'web']])
    expect(flags.get('repo')).toBe(`id:${REPO_ID}`)
  })

  it('refuses a name two sidebar projects share', async () => {
    await expect(
      workspaceCreateFlags(
        [['project', 'web']],
        [
          { id: REPO_ID, displayName: 'web', path: '/src/web' },
          { id: OTHER_REPO_ID, displayName: 'web', path: '/other/web' }
        ]
      )
    ).rejects.toMatchObject({ code: 'ambiguous' })
  })

  it('refuses a project that matches nothing', async () => {
    await expect(workspaceCreateFlags([['project', 'nope']])).rejects.toMatchObject({
      code: 'selector_not_found',
      message: 'No project matches "nope".'
    })
  })

  it('points at --host when the project has no folder in this sidebar', async () => {
    const error = await workspaceCreateFlags([['project', 'web']], []).catch((caught) => caught)
    expect(error).toMatchObject({ code: 'not_in_sidebar' })
    expect((error as { data: { nextSteps: string[] } }).data.nextSteps[0]).toContain('--host')
  })
})

describe('prompt workspace create help', () => {
  it('documents --project and --host and hides the legacy target flags', () => {
    const create = spec('workspace create')
    expect(create.usage).toContain('[--project <project> [--host <host>]]')
    expect(create.usage).not.toContain('--repo')
    expect(create.usage).not.toContain('--project-host-setup')
    expect(create.hiddenFlags).toEqual(['repo', 'project-host-setup'])
    expect(create.allowedFlags).toEqual(expect.arrayContaining(['repo', 'project-host-setup']))
    expect(create.examples?.join('\n')).not.toContain('--repo')
  })

  it('renders --project and --host with descriptions; orca worktree create help is unchanged', () => {
    try {
      setCliProgramName('prompt')
      const help = formatCommandHelp(spec('workspace create'))
      expect(help).toMatch(
        /^ {2}--project <project> +Project name, short id, full id, or project id$/m
      )
      expect(help).toMatch(/^ {2}--host <host> +Create where the project is set up on this host/m)
      expect(help).not.toMatch(/^ {2}--repo\b/m)
      expect(help).not.toMatch(/^ {2}--project-host-setup\b/m)

      setCliProgramName('orca')
      const legacy = formatCommandHelp(
        COMMAND_SPECS.find((entry) => entry.path.join(' ') === 'worktree create')!
      )
      expect(legacy).toMatch(/^ {2}--repo <selector>/m)
      expect(legacy).toMatch(/^ {2}--project-host-setup$/m)
      expect(legacy).toContain('If --repo is omitted')
    } finally {
      setCliProgramName('orca')
    }
  })
})
