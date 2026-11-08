import type { RuntimeTerminalListResult } from '../../shared/runtime-types'
import type { HandlerContext } from '../dispatch'
import { printResult } from '../format'
import type { RuntimeClient, RuntimeRpcSuccess } from '../runtime-client'
import { RuntimeClientError } from '../runtime/types'
import { columnHeaders, emptyListText, formatTable } from '../command-tree/prompt-output'
import { listRepos, listTerminals } from '../command-tree/prompt-selectors'
import { terminalItem, terminalRow, type TerminalItem } from './prompt-lists'
import {
  assertMacHostCommands,
  listTailscaleMacs,
  readRemoteSessionList,
  skippedHostLabel,
  type TailscaleMac
} from './prompt-session-hosts'

export type SessionItem = TerminalItem & {
  agent: string
  resumeId: string | null
}

type HostSessionList = { host: string; items: SessionItem[]; skipped?: string }
type AllHostsResult = {
  items: (SessionItem & { host: string })[]
  hosts: { host: string; skipped?: string }[]
  totalCount: number
  truncated: boolean
}

function isSessionItem(value: unknown): value is SessionItem {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const item = Object.fromEntries(Object.entries(value))
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.state === 'string' &&
    typeof item.agent === 'string' &&
    typeof item.workspace === 'object' &&
    item.workspace !== null
  )
}

function formatAllHosts(result: AllHostsResult): string {
  const now = Date.now()
  const rows = result.hosts.flatMap((entry) =>
    entry.skipped !== undefined
      ? [[entry.host, '-', skippedHostLabel(entry.skipped), '-', '-', '-', '-']]
      : result.items
          .filter((item) => item.host === entry.host)
          .map((item) => [item.host, ...terminalRow(item, now), item.resumeId ?? '-'])
  )
  if (rows.length === 0) {
    return emptyListText()
  }
  return formatTable(
    columnHeaders(['mac', 'id', 'name', 'project', 'state', 'last', 'resume']),
    rows
  )
}

export async function listLocalSessions(
  client: RuntimeClient,
  worktree: string | undefined
): Promise<{ response: RuntimeRpcSuccess<RuntimeTerminalListResult>; items: SessionItem[] }> {
  const [response, repos] = await Promise.all([listTerminals(client, worktree), listRepos(client)])
  const items = response.result.terminals.flatMap((terminal): SessionItem[] =>
    terminal.agentIdentity === undefined
      ? []
      : [
          {
            ...terminalItem(terminal, repos),
            agent: terminal.agentIdentity,
            resumeId: terminal.agentSessionId ?? null
          }
        ]
  )
  return { response, items }
}

async function readHostSessions(
  mac: TailscaleMac,
  client: RuntimeClient
): Promise<HostSessionList> {
  try {
    if (mac.self) {
      return { host: mac.name, items: (await listLocalSessions(client, undefined)).items }
    }
    const items = await readRemoteSessionList(mac.name)
    if (!Array.isArray(items)) {
      return { host: mac.name, items: [], skipped: 'unexpected reply' }
    }
    return { host: mac.name, items: items.filter(isSessionItem) }
  } catch (error) {
    return {
      host: mac.name,
      items: [],
      skipped: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function listAllHosts({ flags, client, json }: HandlerContext): Promise<void> {
  assertMacHostCommands('--all-hosts')
  if (flags.has('project') || flags.has('workspace')) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--all-hosts cannot be combined with --project or --workspace; those names differ per Mac.'
    )
  }
  const lists = await Promise.all(
    (await listTailscaleMacs()).map((mac) => readHostSessions(mac, client))
  )
  const items = lists.flatMap((list) => list.items.map((item) => ({ ...item, host: list.host })))
  printResult(
    {
      id: 'all-hosts',
      ok: true,
      result: {
        items,
        hosts: lists.map(({ host, skipped }) => ({
          host,
          ...(skipped !== undefined ? { skipped } : {})
        })),
        totalCount: items.length,
        truncated: false
      },
      _meta: { runtimeId: 'all-hosts' }
    },
    json,
    formatAllHosts
  )
}
