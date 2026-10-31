import { describe, expect, it, vi } from 'vitest'
import type { RuntimeClient } from '../runtime-client'
import { preResolvePromptSelectors } from './prompt-dispatch'
import { PROMPT_COMMAND_SPECS, rewriteLegacyCommandText } from './prompt-command-specs'

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
    ['workspace create', 'web'],
    ['automation create', 'f9e8d7'],
    ['automation edit', REPO_ID],
    ['project setup add-folder', 'github:acme/web']
  ])('%s turns %s into the project id', async (path, value) => {
    expect((await resolvedProject(path, value)).project).toBe('github:acme/web')
  })

  it('still resolves with --host, since project ids do not depend on the host', async () => {
    expect((await resolvedProject('workspace create', 'web', true)).project).toBe('github:acme/web')
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
