import type { Project, ProjectHostSetup } from '../../shared/project-types'
import type { RuntimeClient } from '../runtime-client'
import { RuntimeClientError } from '../runtime/types'

// Durable projects (`project.list`) group sidebar repos by identity: `repo:<repoId>` for a folder
// or remote-less repo, `github:owner/name` or `git:<host>/<path>` for a repo with a remote. One
// project can hold several repos, and a project can outlive its repos through repo-less setups.

async function callUnlessUnsupported<T>(
  client: RuntimeClient,
  method: string,
  pick: (result: never) => T[]
): Promise<T[]> {
  try {
    return pick((await client.call<never>(method)).result)
  } catch (error) {
    // Older hosts lack the durable catalog; the sidebar list still works without it.
    if (error instanceof RuntimeClientError && error.code === 'method_not_found') {
      return []
    }
    throw error
  }
}

export async function listDurableProjects(client: RuntimeClient): Promise<Project[]> {
  return callUnlessUnsupported(
    client,
    'project.list',
    (result: { projects: Project[] }) => result.projects
  )
}

export async function listProjectHostSetups(client: RuntimeClient): Promise<ProjectHostSetup[]> {
  return callUnlessUnsupported(
    client,
    'projectHostSetup.list',
    (result: { setups: ProjectHostSetup[] }) => result.setups
  )
}

/** Durable projects none of whose repos is in the sidebar; they exist only as host setups. */
export function repoLessProjects(
  projects: readonly Project[],
  repoIds: ReadonlySet<string>
): Project[] {
  return projects.filter((project) => !project.sourceRepoIds.some((id) => repoIds.has(id)))
}
