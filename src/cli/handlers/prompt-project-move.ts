import type { Repo } from '../../shared/repo-types'
import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { getRequiredStringFlag } from '../flags'
import { resolveRepoPathArgument } from '../repo-path-arguments'
import { shortenHomePath, shortId } from '../command-tree/prompt-output'
import { resolvePromptProjectSelector } from '../command-tree/prompt-selectors'
import { projectItem, type ProjectItem } from './prompt-project'

type RepoRelocateResponse = {
  repo: Repo
  previousPath: string
  moved: boolean
  worktreeCount: number
  sessionTabCount: number
}

export type ProjectMoveResult = {
  project: ProjectItem
  previousPath: string
  moved: boolean
  worktreeCount: number
  sessionTabCount: number
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

export function formatProjectMove(result: ProjectMoveResult): string {
  const { project } = result
  if (!result.moved) {
    return `${project.name} (${shortId(project.id)}) is already at ${shortenHomePath(project.path)}.`
  }
  return `Moved ${project.name} to ${shortenHomePath(project.path)}. Kept ${plural(result.worktreeCount, 'worktree')} and ${plural(result.sessionTabCount, 'session tab')}.`
}

/** Printed by `prompt project add` when the folder is already a project under another path. */
export function formatAlreadyRegisteredNotice(
  project: ProjectItem,
  alreadyRegistered: { path: string; requestedPath?: string }
): string {
  const target = alreadyRegistered.requestedPath ?? project.path
  return `Already registered as ${shortenHomePath(alreadyRegistered.path)} (id ${project.id}). To change its path: prompt project move ${project.id} ${target}`
}

export const PROMPT_PROJECT_MOVE_HANDLERS: Record<string, CommandHandler> = {
  'prompt project move': async ({ flags, client, cwd, json }) => {
    const path = resolveRepoPathArgument(
      getRequiredStringFlag(flags, 'path'),
      cwd,
      client.isRemote,
      'Remote project move'
    )
    const repo = await resolvePromptProjectSelector(client, getRequiredStringFlag(flags, 'project'))
    const response = await client.call<RepoRelocateResponse>('repo.relocate', { repo, path })
    const { repo: moved, ...counts } = response.result
    printResult(
      { ...response, result: { ...counts, project: projectItem(moved) } },
      json,
      formatProjectMove
    )
  }
}
