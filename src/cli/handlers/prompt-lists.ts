import type { Repo } from '../../shared/repo-types'
import type { RuntimeTerminalSummary, RuntimeWorktreeListResult } from '../../shared/runtime-types'
import { splitWorktreeId } from '../../shared/worktree/id'
import { readOrcaCliVersion } from '../cli-version'
import type { CommandHandler } from '../dispatch'
import { getOptionalPositiveIntegerFlag, getOptionalStringFlag } from '../flags'
import { printResult } from '../format'
import { getOptionalWorktreeSelector } from '../selectors'
import { RuntimeClientError } from '../runtime/types'
import {
  columnHeaders,
  emptyListText,
  formatRelativeTime,
  formatTable,
  shortenHomePath,
  shortId,
  stateLabel
} from '../command-tree/prompt-output'
import {
  listRepos,
  listTerminals,
  resolvePromptProjectSelector,
  terminalName
} from '../command-tree/prompt-selectors'

type NamedRef = { id: string; name: string }

export type WorkspaceItem = {
  /** `<repoId>::<path>`, the id `--workspace id:` selectors and the guides use. */
  id: string
  /** Stable instance key when the host has one; its prefix is the short id shown in tables. */
  identity: string | null
  name: string
  project: NamedRef
  branch: string
  path: string
}

export type TerminalItem = {
  id: string
  name: string
  project: NamedRef | null
  workspace: { id: string; path: string; branch: string }
  agent: string | null
  state: 'running' | 'exited'
  lastOutputAt: number | null
}

function projectRef(repos: readonly Repo[], repoId: string | undefined): NamedRef | null {
  const repo = repos.find((candidate) => candidate.id === repoId)
  return repo ? { id: repo.id, name: repo.displayName } : null
}

export function terminalItem(
  terminal: RuntimeTerminalSummary,
  repos: readonly Repo[]
): TerminalItem {
  return {
    id: terminal.handle,
    name: terminalName(terminal),
    project: projectRef(repos, splitWorktreeId(terminal.worktreeId)?.repoId),
    workspace: { id: terminal.worktreeId, path: terminal.worktreePath, branch: terminal.branch },
    agent: terminal.agentIdentity ?? null,
    // A liveness verdict, when present, is the host's answer; `connected` alone can lag.
    state: terminal.connected && terminal.verdict !== 'exited' ? 'running' : 'exited',
    lastOutputAt: terminal.lastOutputAt
  }
}

export function terminalRow(item: TerminalItem, now: number): string[] {
  return [
    shortId(item.id),
    item.name,
    item.project?.name ?? shortenHomePath(item.workspace.path),
    stateLabel(item.state),
    formatRelativeTime(item.lastOutputAt, now)
  ]
}

function formatTerminalItems(result: { items: TerminalItem[] }): string {
  if (result.items.length === 0) {
    return emptyListText()
  }
  const now = Date.now()
  return formatTable(
    columnHeaders(['id', 'name', 'project', 'state', 'last']),
    result.items.map((item) => terminalRow(item, now))
  )
}

function formatWorkspaceItems(result: { items: WorkspaceItem[] }): string {
  if (result.items.length === 0) {
    return emptyListText()
  }
  return formatTable(
    columnHeaders(['id', 'name', 'project', 'branch', 'path']),
    result.items.map((item) => [
      shortId(item.identity ?? item.id),
      item.name,
      item.project.name,
      item.branch || '-',
      shortenHomePath(item.path)
    ])
  )
}

export const PROMPT_LIST_HANDLERS: Record<string, CommandHandler> = {
  'prompt app version': async ({ json }) => {
    const version = readOrcaCliVersion()
    if (!version) {
      throw new RuntimeClientError(
        'version_unavailable',
        'Could not determine the Prompt version for this build.'
      )
    }
    if (json) {
      console.log(JSON.stringify({ ok: true, result: { version } }, null, 2))
      return
    }
    console.log(version)
  },
  'prompt workspace list': async ({ flags, client, json }) => {
    const projectFlag = getOptionalStringFlag(flags, 'project')
    const repo = projectFlag ? await resolvePromptProjectSelector(client, projectFlag) : undefined
    const [response, repos] = await Promise.all([
      client.call<RuntimeWorktreeListResult>('worktree.list', {
        repo,
        limit: getOptionalPositiveIntegerFlag(flags, 'limit')
      }),
      listRepos(client)
    ])
    const items = response.result.worktrees.map((worktree): WorkspaceItem => ({
      id: worktree.id,
      identity: worktree.identity?.key ?? null,
      name: worktree.displayName,
      project: projectRef(repos, worktree.repoId) ?? { id: worktree.repoId, name: '-' },
      branch: worktree.branch,
      path: worktree.path
    }))
    printResult(
      {
        ...response,
        result: {
          items,
          totalCount: response.result.totalCount,
          truncated: response.result.truncated
        }
      },
      json,
      formatWorkspaceItems
    )
  },
  'prompt terminal list': async ({ flags, client, cwd, json }) => {
    const worktree = await getOptionalWorktreeSelector(flags, 'workspace', cwd, client)
    const [response, repos] = await Promise.all([
      listTerminals(client, worktree),
      listRepos(client)
    ])
    const listing = response.result
    const limit = getOptionalPositiveIntegerFlag(flags, 'limit')
    const terminals = limit ? listing.terminals.slice(0, limit) : listing.terminals
    printResult(
      {
        ...response,
        result: {
          items: terminals.map((terminal) => terminalItem(terminal, repos)),
          totalCount: listing.totalCount,
          truncated: listing.truncated || terminals.length < listing.terminals.length
        }
      },
      json,
      formatTerminalItems
    )
  }
}
