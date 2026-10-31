import { getRepoExecutionHostId, parseExecutionHostId } from '../../shared/execution-host'
import type { Project, ProjectHostSetup, ProjectHostSetupState } from '../../shared/project-types'
import type { Repo } from '../../shared/repo-types'
import { resolveCliLocale, type CliLocale } from '../command-tree/cli-surface'
import {
  columnHeaders,
  emptyListText,
  formatTable,
  shortenHomePath,
  shortId
} from '../command-tree/prompt-output'
import {
  listDurableProjects,
  listProjectHostSetups,
  repoLessProjects
} from '../command-tree/prompt-project-catalog'
import { listSshTargets, LOCAL_HOST_LIST_NAME } from '../host-selector-alternatives'
import { setupHostId } from '../project-selector'
import type { RuntimeClient, RuntimeRpcSuccess } from '../runtime-client'
import { getDefaultUserDataPath } from '../runtime-client'
import { listEnvironments } from '../runtime/environments'
import type { ProjectItem } from './prompt-project'

export type ProjectHostItem = {
  /** The `--host` value: local, ssh:<target-id>, or runtime:<environment-id>. */
  id: string
  name: string
  state: ProjectHostSetupState
}

export type ProjectListItem = ProjectItem & {
  /** Durable project id that project setup, workspace create, and automation flags take. */
  projectId: string | null
  /** Where the project is set up: this row's own host first, then repo-less setups elsewhere. */
  hosts: ProjectHostItem[]
}

type HostEntry = { hostId: string; state: ProjectHostSetupState }

/** Setups without a sidebar repo: a host where the project is planned, provisioned, or failed. */
function repoLessSetups(
  setups: readonly ProjectHostSetup[],
  repoIds: ReadonlySet<string>
): ProjectHostSetup[] {
  return setups.filter((setup) => !setup.repoId || !repoIds.has(setup.repoId))
}

function uniqueHosts(entries: readonly HostEntry[]): HostEntry[] {
  const seen = new Set<string>()
  return entries.filter((entry) => !seen.has(entry.hostId) && seen.add(entry.hostId))
}

function repoRow(
  repo: Repo,
  setups: readonly ProjectHostSetup[],
  projects: readonly Project[],
  extraSetups: readonly ProjectHostSetup[]
): { item: Omit<ProjectListItem, 'hosts'>; hosts: HostEntry[] } {
  const ownHostId = getRepoExecutionHostId(repo)
  // The same repo id can exist on several hosts; prefer the setup on this row's host.
  const own =
    setups.find((setup) => setup.repoId === repo.id && setupHostId(setup) === ownHostId) ??
    setups.find((setup) => setup.repoId === repo.id)
  const projectId =
    own?.projectId ??
    projects.find((project) => project.sourceRepoIds.includes(repo.id))?.id ??
    null
  const others = extraSetups.filter((setup) => projectId !== null && setup.projectId === projectId)
  return {
    item: {
      id: repo.id,
      name: repo.displayName,
      kind: repo.kind ?? 'git',
      path: repo.path,
      badgeColor: repo.badgeColor,
      icon: repo.repoIcon ?? null,
      projectId
    },
    hosts: uniqueHosts([
      { hostId: own ? setupHostId(own) : ownHostId, state: own?.setupState ?? 'ready' },
      ...others.map((setup) => ({ hostId: setupHostId(setup), state: setup.setupState }))
    ])
  }
}

function repoLessRow(
  project: Project,
  extraSetups: readonly ProjectHostSetup[]
): { item: Omit<ProjectListItem, 'hosts'>; hosts: HostEntry[] } {
  const own = extraSetups.filter((setup) => setup.projectId === project.id)
  return {
    item: {
      id: project.id,
      name: project.displayName,
      kind: project.kind ?? 'git',
      path: own.find((setup) => setup.path)?.path ?? '',
      badgeColor: project.badgeColor,
      icon: project.repoIcon ?? null,
      projectId: project.id
    },
    hosts: uniqueHosts(
      own.map((setup) => ({ hostId: setupHostId(setup), state: setup.setupState }))
    )
  }
}

async function hostNamer(
  client: RuntimeClient,
  hostIds: readonly string[]
): Promise<(hostId: string) => string> {
  const parsed = hostIds.map((id) => parseExecutionHostId(id))
  const sshLabels = new Map(
    parsed.some((host) => host?.kind === 'ssh')
      ? (await listSshTargets(client)).map((target) => [target.id, target.label] as const)
      : []
  )
  let environmentNames = new Map<string, string>()
  if (parsed.some((host) => host?.kind === 'runtime')) {
    try {
      environmentNames = new Map(
        listEnvironments(getDefaultUserDataPath()).map((env) => [env.id, env.name] as const)
      )
    } catch {
      // A missing or unreadable pairing store only costs the friendly name.
    }
  }
  return (hostId) => {
    const host = parseExecutionHostId(hostId)
    if (host?.kind === 'local') {
      // Through a paired server, `local` is the server's own machine, not this one.
      return client.isRemote ? 'server' : LOCAL_HOST_LIST_NAME
    }
    if (host?.kind === 'ssh') {
      return sshLabels.get(host.targetId) ?? host.targetId
    }
    if (host?.kind === 'runtime') {
      return environmentNames.get(host.environmentId) ?? host.environmentId
    }
    return hostId
  }
}

/** Sidebar projects (repos) with where each is set up, plus durable projects with no repo. */
export async function listProjectItems(
  client: RuntimeClient
): Promise<RuntimeRpcSuccess<{ items: ProjectListItem[] }>> {
  const [response, projects, setups] = await Promise.all([
    client.call<{ repos: Repo[] }>('repo.list'),
    listDurableProjects(client),
    listProjectHostSetups(client)
  ])
  const repos = response.result.repos
  const repoIds = new Set(repos.map((repo) => repo.id))
  const extraSetups = repoLessSetups(setups, repoIds)
  const rows = [
    ...repos.map((repo) => repoRow(repo, setups, projects, extraSetups)),
    ...repoLessProjects(projects, repoIds).map((project) => repoLessRow(project, extraSetups))
  ]
  const nameOf = await hostNamer(
    client,
    rows.flatMap((row) => row.hosts.map((host) => host.hostId))
  )
  const items = rows.map((row) => ({
    ...row.item,
    hosts: row.hosts.map((host) => ({
      id: host.hostId,
      name: nameOf(host.hostId),
      state: host.state
    }))
  }))
  return { ...response, result: { items } }
}

const HOST_TEXT: Readonly<Record<CliLocale, Readonly<Record<string, string>>>> = {
  en: {
    [LOCAL_HOST_LIST_NAME]: LOCAL_HOST_LIST_NAME,
    server: 'server',
    'not-set-up': 'not set up',
    'setting-up': 'setting up',
    error: 'error',
    unsupported: 'unsupported'
  },
  ko: {
    [LOCAL_HOST_LIST_NAME]: '이 컴퓨터',
    server: '서버',
    'not-set-up': '설정 안 됨',
    'setting-up': '설정 중',
    error: '오류',
    unsupported: '지원 안 됨'
  }
}

/** One cell: `this machine`, or `this machine, gpu-box (not set up)` for several hosts. */
export function formatHostsCell(
  hosts: readonly ProjectHostItem[],
  locale: CliLocale = resolveCliLocale()
): string {
  if (hosts.length === 0) {
    return '-'
  }
  const text = HOST_TEXT[locale]
  return hosts
    .map((host) => {
      const name = host.id === 'local' ? (text[host.name] ?? host.name) : host.name
      return host.state === 'ready' ? name : `${name} (${text[host.state] ?? host.state})`
    })
    .join(', ')
}

export function formatProjectList(result: { items: ProjectListItem[] }): string {
  if (result.items.length === 0) {
    return emptyListText()
  }
  return formatTable(
    columnHeaders(['id', 'name', 'kind', 'host', 'path']),
    result.items.map((item) => [
      // A repo-less row's id is its project id; `github:owner/name` reads better whole.
      item.id === item.projectId && !item.id.startsWith('repo:') ? item.id : shortId(item.id),
      item.name,
      item.kind,
      formatHostsCell(item.hosts),
      item.path ? shortenHomePath(item.path) : '-'
    ])
  )
}
