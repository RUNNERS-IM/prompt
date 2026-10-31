import { readFile, stat } from 'node:fs/promises'
import { basename, resolve as resolvePath } from 'node:path'
import type { RepoCreateFailure } from '../../shared/repo-create-failure-copy'
import { DEFAULT_REPO_BADGE_COLOR, normalizeRepoBadgeColor } from '../../shared/repo-badge-color'
import { MAX_REPO_ICON_UPLOAD_BYTES, sanitizeRepoIcon, type RepoIcon } from '../../shared/repo-icon'
import type { Repo } from '../../shared/repo-types'
import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { resolveRepoPathArgument } from '../repo-path-arguments'
import { RuntimeClientError } from '../runtime/types'
import { shortenHomePath, shortId } from '../command-tree/prompt-output'
import { resolvePromptProjectSelector } from '../command-tree/prompt-selectors'
import { formatProjectList, listProjectItems } from './prompt-project-list'

export type ProjectItem = {
  id: string
  name: string
  kind: 'git' | 'folder'
  path: string
  badgeColor: string
  icon: RepoIcon | null
}

export function projectItem(repo: Repo): ProjectItem {
  return {
    id: repo.id,
    name: repo.displayName,
    kind: repo.kind ?? 'git',
    path: repo.path,
    badgeColor: repo.badgeColor,
    icon: repo.repoIcon ?? null
  }
}

function formatProject(result: { project: ProjectItem }): string {
  const { project } = result
  return [
    `${project.name}  (${shortId(project.id)})`,
    `  id: ${project.id}`,
    `  kind: ${project.kind}`,
    `  path: ${shortenHomePath(project.path)}`
  ].join('\n')
}

function getKindFlag(flags: Map<string, string | boolean>): 'git' | 'folder' | undefined {
  const kind = getOptionalStringFlag(flags, 'kind')
  if (kind !== undefined && kind !== 'git' && kind !== 'folder') {
    throw new RuntimeClientError('invalid_argument', '--kind must be git or folder.')
  }
  return kind
}

function isPng(bytes: Buffer): boolean {
  return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
}

function isWebp(bytes: Buffer): boolean {
  return (
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  )
}

/** Read --icon into the repo icon the sidebar renders; the host silently drops icons it rejects. */
export async function parseProjectIconFlag(value: string, cwd: string): Promise<RepoIcon | null> {
  if (value === 'none') {
    return null
  }
  let candidate: unknown
  if (value.startsWith('emoji:')) {
    candidate = { type: 'emoji', emoji: value.slice('emoji:'.length) }
  } else if (value.startsWith('lucide:')) {
    candidate = { type: 'lucide', name: value.slice('lucide:'.length) }
  } else {
    const path = resolvePath(cwd, value)
    const size = await stat(path).then(
      (stats) => (stats.isFile() ? stats.size : null),
      () => null
    )
    if (size === null) {
      throw new RuntimeClientError('invalid_argument', `--icon file not found: ${path}`)
    }
    if (size > MAX_REPO_ICON_UPLOAD_BYTES) {
      throw new RuntimeClientError(
        'invalid_argument',
        `--icon file is ${Math.ceil(size / 1024)} KB; the limit is ${MAX_REPO_ICON_UPLOAD_BYTES / 1024} KB.`
      )
    }
    const bytes = await readFile(path)
    const mime = isPng(bytes) ? 'image/png' : isWebp(bytes) ? 'image/webp' : null
    if (!mime) {
      throw new RuntimeClientError('invalid_argument', '--icon file must be a PNG or WebP image.')
    }
    candidate = {
      type: 'image',
      src: `data:${mime};base64,${bytes.toString('base64')}`,
      source: 'file',
      label: basename(path)
    }
  }
  const icon = sanitizeRepoIcon(candidate)
  if (!icon) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--icon must be a PNG/WebP file, emoji:<emoji>, lucide:<IconName>, or none.'
    )
  }
  return icon
}

function parseColorFlag(value: string): string {
  if (value === 'none') {
    return DEFAULT_REPO_BADGE_COLOR
  }
  const color = normalizeRepoBadgeColor(value)
  if (!color) {
    throw new RuntimeClientError('invalid_argument', '--color must be a hex color such as #22c55e.')
  }
  return color
}

function parseVisibilityFlag(value: string): 'show' | 'hide' | null {
  if (value !== 'show' && value !== 'hide' && value !== 'inherit') {
    throw new RuntimeClientError(
      'invalid_argument',
      '--external-worktree-visibility must be show, hide, or inherit.'
    )
  }
  return value === 'inherit' ? null : value
}

const PROJECT_SET_FLAGS = ['name', 'icon', 'color', 'base-ref', 'external-worktree-visibility']

export const PROMPT_PROJECT_HANDLERS: Record<string, CommandHandler> = {
  'prompt project list': async ({ client, json }) => {
    printResult(await listProjectItems(client), json, formatProjectList)
  },
  'prompt project add': async ({ flags, client, cwd, json }) => {
    const path = resolveRepoPathArgument(
      getRequiredStringFlag(flags, 'path'),
      cwd,
      client.isRemote,
      'Remote project add'
    )
    const kind = getKindFlag(flags)
    const name = getOptionalStringFlag(flags, 'name')?.trim()
    const response = await client.call<{ repo: Repo }>('repo.add', {
      path,
      ...(kind ? { kind } : {}),
      ...(name ? { displayName: name } : {})
    })
    printResult(
      { ...response, result: { project: projectItem(response.result.repo) } },
      json,
      formatProject
    )
  },
  'prompt project show': async ({ flags, client, json }) => {
    const repo = await resolvePromptProjectSelector(client, getRequiredStringFlag(flags, 'project'))
    const response = await client.call<{ repo: Repo }>('repo.show', { repo })
    printResult(
      { ...response, result: { project: projectItem(response.result.repo) } },
      json,
      formatProject
    )
  },
  'prompt project set': async ({ flags, client, cwd, json }) => {
    if (!PROJECT_SET_FLAGS.some((flag) => flags.has(flag))) {
      throw new RuntimeClientError(
        'invalid_argument',
        `Nothing to change. Pass at least one of ${PROJECT_SET_FLAGS.map((flag) => `--${flag}`).join(', ')}.`
      )
    }
    const repo = await resolvePromptProjectSelector(client, getRequiredStringFlag(flags, 'project'))
    // Parse every flag before the first write so a bad value changes nothing.
    const name = flags.has('name') ? getRequiredStringFlag(flags, 'name').trim() : undefined
    const icon = flags.has('icon')
      ? await parseProjectIconFlag(getRequiredStringFlag(flags, 'icon'), cwd)
      : undefined
    const color = flags.has('color')
      ? parseColorFlag(getRequiredStringFlag(flags, 'color'))
      : undefined
    const visibility = flags.has('external-worktree-visibility')
      ? parseVisibilityFlag(getRequiredStringFlag(flags, 'external-worktree-visibility'))
      : undefined
    const baseRef = flags.has('base-ref') ? getRequiredStringFlag(flags, 'base-ref') : undefined
    const updates = {
      ...(name ? { displayName: name } : {}),
      ...(icon !== undefined ? { repoIcon: icon } : {}),
      ...(color ? { badgeColor: color } : {}),
      ...(visibility !== undefined ? { externalWorktreeVisibility: visibility } : {})
    }
    let response = Object.keys(updates).length
      ? await client.call<{ repo: Repo }>('repo.update', { repo, updates })
      : null
    if (baseRef !== undefined) {
      response = await client.call<{ repo: Repo }>('repo.setBaseRef', { repo, ref: baseRef })
    }
    printResult(
      { ...response!, result: { project: projectItem(response!.result.repo) } },
      json,
      formatProject
    )
  },
  'prompt project remove': async ({ flags, client, json }) => {
    const repo = await resolvePromptProjectSelector(client, getRequiredStringFlag(flags, 'project'))
    const shown = await client.call<{ repo: Repo }>('repo.show', { repo })
    const response = await client.call<unknown>('repo.rm', { repo })
    const project = projectItem(shown.result.repo)
    printResult(
      { ...response, result: { removed: true, project: { id: project.id, name: project.name } } },
      json,
      (value) =>
        `Removed ${value.project.name} (${shortId(value.project.id)}). Files on disk are kept.`
    )
  },
  'prompt project clone': async ({ flags, client, cwd, json }) => {
    const destination = resolveRepoPathArgument(
      getRequiredStringFlag(flags, 'destination'),
      cwd,
      client.isRemote,
      'Remote project clone'
    )
    const response = await client.call<{ repo: Repo }>('repo.clone', {
      url: getRequiredStringFlag(flags, 'url'),
      destination
    })
    printResult(
      { ...response, result: { project: projectItem(response.result.repo) } },
      json,
      formatProject
    )
  },
  'prompt project create': async ({ flags, client, cwd, json }) => {
    const parentPath = resolveRepoPathArgument(
      getRequiredStringFlag(flags, 'parent'),
      cwd,
      client.isRemote,
      'Remote project create'
    )
    const kind = getKindFlag(flags)
    const response = await client.call<{ repo: Repo } | RepoCreateFailure>('repo.create', {
      parentPath,
      name: getRequiredStringFlag(flags, 'name'),
      ...(kind ? { kind } : {})
    })
    // The host answers a refused create with ok:true and an error body; surface it as a failure.
    if (!('repo' in response.result)) {
      throw new RuntimeClientError(
        response.result.errorCode ?? 'create_failed',
        response.result.error,
        response.result.errorDetail ? { detail: response.result.errorDetail } : undefined
      )
    }
    printResult(
      { ...response, result: { project: projectItem(response.result.repo) } },
      json,
      formatProject
    )
  }
}
