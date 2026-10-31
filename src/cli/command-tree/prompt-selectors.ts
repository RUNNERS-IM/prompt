import type { Project } from '../../shared/project-types'
import type { Repo } from '../../shared/repo-types'
import type {
  RuntimeTerminalListResult,
  RuntimeTerminalSummary,
  RuntimeWorktreeListResult
} from '../../shared/runtime-types'
import type { RuntimeClient, RuntimeRpcSuccess } from '../runtime-client'
import { RuntimeClientError } from '../runtime/types'
import { idBody, shortenHomePath, shortId } from './prompt-output'
import { listDurableProjects, repoLessProjects } from './prompt-project-catalog'

/** Shortest id prefix accepted, like a git short sha: shorter prefixes collide too easily. */
export const MIN_SHORT_ID_LENGTH = 6

export type SelectorCandidate = {
  id: string
  name: string
  /** Shown in the ambiguity list so the user can tell same-named candidates apart. */
  project?: string
  /** Other full ids that name this candidate (e.g. a session's resume id). */
  otherIds?: readonly string[]
}

type SelectorKind = 'project' | 'workspace' | 'terminal' | 'session'

function prefixMatches(candidate: SelectorCandidate, selector: string): boolean {
  const lowered = selector.toLowerCase()
  return [candidate.id, idBody(candidate.id), ...(candidate.otherIds ?? [])].some((id) =>
    id.toLowerCase().startsWith(lowered)
  )
}

function ambiguousError(
  kind: SelectorKind,
  selector: string,
  matches: readonly SelectorCandidate[]
): RuntimeClientError {
  const candidates = matches.map((match) => ({
    id: match.id,
    shortId: shortId(match.id),
    name: match.name,
    ...(match.project ? { project: match.project } : {})
  }))
  const lines = candidates.map(
    (candidate) =>
      `  ${candidate.shortId}  ${candidate.name}${candidate.project ? `  (${candidate.project})` : ''}`
  )
  return new RuntimeClientError(
    'ambiguous',
    [`"${selector}" matches ${matches.length} ${kind}s; nothing was changed.`, ...lines].join('\n'),
    {
      candidates,
      nextSteps: [`Pass a longer id prefix or the full id, e.g. ${candidates[0].id}`]
    }
  )
}

/**
 * Resolve a name, short id prefix, or full id. A full id wins outright; otherwise every name
 * and prefix match counts, and more than one is refused rather than guessed.
 */
export function matchSelector<T extends SelectorCandidate>(
  selector: string,
  candidates: readonly T[],
  kind: SelectorKind
): T | null {
  const trimmed = selector.trim()
  if (!trimmed) {
    return null
  }
  const exact = candidates.filter(
    (candidate) => candidate.id === trimmed || candidate.otherIds?.includes(trimmed)
  )
  if (exact.length === 1) {
    return exact[0]
  }
  const named = candidates.filter((candidate) => candidate.name === trimmed)
  const loosely =
    named.length > 0
      ? named
      : candidates.filter((candidate) => candidate.name.toLowerCase() === trimmed.toLowerCase())
  const prefixed =
    trimmed.length >= MIN_SHORT_ID_LENGTH
      ? candidates.filter((candidate) => prefixMatches(candidate, trimmed))
      : []
  const matches = [...new Set([...exact, ...loosely, ...prefixed])]
  if (matches.length > 1) {
    throw ambiguousError(kind, trimmed, matches)
  }
  return matches[0] ?? null
}

function looksLikePath(value: string): boolean {
  return /^(?:[/~.]|[A-Za-z]:[\\/]|\\\\)/.test(value)
}

const PROJECT_SELECTOR_PREFIXES = ['id:', 'path:', 'name:']
const WORKSPACE_SELECTOR_PREFIXES = [
  'identity:',
  'id:',
  'path:',
  'name:',
  'branch:',
  'issue:',
  'folder:',
  'worktree:'
]
const WORKSPACE_KEYWORDS = new Set(['active', 'current', 'all'])

export type ProjectCandidate = SelectorCandidate & { repo: Repo }

/** Sidebar repos; with `projects`, each also answers to the durable project ids that hold it. */
export function projectCandidates(
  repos: readonly Repo[],
  projects: readonly Project[] = []
): ProjectCandidate[] {
  return repos.map((repo) => {
    const durableIds = projects
      .filter((project) => project.sourceRepoIds.includes(repo.id))
      .map((project) => project.id)
    return {
      id: repo.id,
      name: repo.displayName,
      project: shortenHomePath(repo.path),
      ...(durableIds.length > 0 ? { otherIds: durableIds } : {}),
      repo
    }
  })
}

/** Durable projects, matched by their id, their repos' ids, or their name. */
export function durableProjectCandidates(
  projects: readonly Project[]
): (SelectorCandidate & { durable: Project })[] {
  return projects.map((project) => ({
    id: project.id,
    name: project.displayName,
    project: project.id,
    otherIds: project.sourceRepoIds,
    durable: project
  }))
}

export async function listRepos(client: RuntimeClient): Promise<Repo[]> {
  return (await client.call<{ repos: Repo[] }>('repo.list')).result.repos
}

async function listDurableProjectsOrNone(client: RuntimeClient): Promise<Project[]> {
  // A failed lookup must not block a selector the host can still resolve itself.
  return listDurableProjects(client).catch(() => [])
}

/**
 * Canonical `id:<repo id>` for name, short-id, repo-id, and durable project id (`repo:<id>`,
 * `github:owner/name`) selectors; other grammar passes to the host unchanged.
 */
export async function resolvePromptProjectSelector(
  client: RuntimeClient,
  value: string
): Promise<string> {
  if (
    PROJECT_SELECTOR_PREFIXES.some((prefix) => value.startsWith(prefix)) ||
    looksLikePath(value)
  ) {
    return value
  }
  const repos = await listRepos(client)
  const direct = matchSelector(value, projectCandidates(repos), 'project')
  if (direct) {
    return `id:${direct.id}`
  }
  const projects = await listDurableProjectsOrNone(client)
  const viaProject = matchSelector(value, projectCandidates(repos, projects), 'project')
  if (viaProject) {
    return `id:${viaProject.id}`
  }
  const repoIds = new Set(repos.map((repo) => repo.id))
  const repoLess = matchSelector(
    value,
    durableProjectCandidates(repoLessProjects(projects, repoIds)),
    'project'
  )
  if (repoLess) {
    throw new RuntimeClientError(
      'not_in_sidebar',
      `Project ${repoLess.name} (${repoLess.id}) has no folder in the sidebar, so this command cannot use it.`,
      {
        nextSteps: [
          `Run \`prompt project setup list --project ${repoLess.id}\` to see where it is set up.`
        ]
      }
    )
  }
  return value
}

/**
 * The durable project id (`repo:<id>`, `github:owner/name`, ...) that project setup, workspace
 * create, and automation `--project` flags take, from a name, short id, repo id, or project id.
 */
export async function resolvePromptDurableProjectSelector(
  client: RuntimeClient,
  value: string
): Promise<string> {
  const projects = await listDurableProjectsOrNone(client)
  return matchSelector(value, durableProjectCandidates(projects), 'project')?.id ?? value
}

export async function resolvePromptWorkspaceSelector(
  client: RuntimeClient,
  value: string
): Promise<string> {
  if (
    WORKSPACE_KEYWORDS.has(value) ||
    WORKSPACE_SELECTOR_PREFIXES.some((prefix) => value.startsWith(prefix)) ||
    looksLikePath(value)
  ) {
    return value
  }
  const worktrees = (
    await client.call<RuntimeWorktreeListResult>('worktree.list', { limit: 10_000 })
  ).result.worktrees
  const candidates = worktrees.map((worktree) => ({
    id: worktree.identity?.key ?? worktree.id,
    name: worktree.displayName,
    project: shortenHomePath(worktree.path),
    otherIds: [worktree.id]
  }))
  const match = matchSelector(value, candidates, 'workspace')
  if (!match) {
    return value
  }
  return match.id.startsWith('wt2:') ? `identity:${match.id}` : `id:${match.id}`
}

export function terminalName(terminal: RuntimeTerminalSummary): string {
  return terminal.paneTitle?.trim() || terminal.title?.trim() || terminal.agentIdentity || '-'
}

export type TerminalCandidate = SelectorCandidate & { terminal: RuntimeTerminalSummary }

export function terminalCandidates(
  terminals: readonly RuntimeTerminalSummary[]
): TerminalCandidate[] {
  return terminals.map((terminal) => ({
    id: terminal.handle,
    name: terminalName(terminal),
    project: shortenHomePath(terminal.worktreePath),
    ...(terminal.agentSessionId ? { otherIds: [terminal.agentSessionId] } : {}),
    terminal
  }))
}

export async function listTerminals(
  client: RuntimeClient,
  worktree?: string
): Promise<RuntimeRpcSuccess<RuntimeTerminalListResult>> {
  return await client.call<RuntimeTerminalListResult>('terminal.list', {
    ...(worktree ? { worktree } : {}),
    includeVisualLayouts: false
  })
}

const FULL_TERMINAL_HANDLE = /^term_[A-Za-z0-9-]{16,}$/

export async function resolvePromptTerminalSelector(
  client: RuntimeClient,
  value: string,
  options: { agentsOnly?: boolean } = {}
): Promise<string> {
  if (FULL_TERMINAL_HANDLE.test(value) && !options.agentsOnly) {
    return value
  }
  const terminals = (await listTerminals(client)).result.terminals.filter(
    (terminal) => !options.agentsOnly || terminal.agentIdentity !== undefined
  )
  const kind = options.agentsOnly ? 'session' : 'terminal'
  const match = matchSelector(value, terminalCandidates(terminals), kind)
  if (match) {
    return match.id
  }
  if (options.agentsOnly) {
    throw new RuntimeClientError('selector_not_found', `No session matches "${value}".`, {
      nextSteps: ['Run `prompt session list` to see sessions and their ids.']
    })
  }
  return value
}
