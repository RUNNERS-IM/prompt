// `prompt session compact`: 쉬는 Claude 세션에 /compact 를 보내 대화를 요약해 줄인다.
// 답을 쓰는 중 · 입력칸에 글이 있음 · 뒤에서 작업이 도는 세션은 건드리지 않는다.
// 판단은 claude-config 의 session-cwd-check · session-idle-close 와 같은 화면 표시를 본다.

import type { RuntimeTerminalRead } from '../../shared/runtime-types'
import { TERMINAL_PROMPT_DELIVERY_RUNTIME_CAPABILITY } from '../../shared/protocol-version'
import type { HandlerContext } from '../dispatch'
import { getOptionalStringFlag } from '../flags'
import { printResult } from '../format'
import type { RuntimeClient } from '../runtime-client'
import { RuntimeClientError } from '../runtime/types'
import { columnHeaders, emptyListText, formatTable, shortId } from '../command-tree/prompt-output'
import { resolvePromptTerminalSelector } from '../command-tree/prompt-selectors'
import {
  assertMacHostCommands,
  listTailscaleMacs,
  readRemoteCompact,
  skippedHostLabel
} from './prompt-session-hosts'
import { listLocalSessions, type SessionItem } from './prompt-session-listing'

export const COMPACT_TEXT = '/compact'
const DEFAULT_IDLE_MINUTES = 30

export type CompactSkipReason =
  | 'caller'
  | 'not-claude'
  | 'exited'
  | 'working'
  | 'draft'
  | 'background'
  | 'recent'
  | 'unreadable'
  | 'send-failed'

export type CompactOutcome = 'sent' | 'would-send' | 'skipped'

export type CompactItem = {
  id: string
  name: string
  outcome: CompactOutcome
  reason?: CompactSkipReason
  host?: string
}

export type CompactResult = {
  items: CompactItem[]
  hosts?: { host: string; skipped?: string }[]
  dryRun: boolean
}

// 답을 쓰는 중이면 「Twisting… (3m 11s」 같은 진행 줄이나 「esc to interrupt」 가 보인다.
const WORKING = /…\s*\(\d+[hms]|esc to interrupt/i
// 뒤 작업이 있으면 맨 아래 상태 줄에 「1 shell」 · 「2 background tasks」 같은 표시가 붙는다.
const BACKGROUND = /\b(agents?|shells?|monitors?|background|tasks?)\b/i
// 입력칸 줄. 선택 창(「❯ 1. Yes」)도 여기 걸려 글이 있는 것으로 본다.
const PROMPT_LINE = /^❯(.*)$/

/** 화면 한 장과 마지막 출력 시각으로 /compact 를 보내도 되는지 판단한다. null 이면 보낸다. */
export function compactSkipReason(
  screen: Pick<RuntimeTerminalRead, 'tail' | 'draft'>,
  lastOutputAt: number | null,
  now: number,
  idleMs: number
): CompactSkipReason | null {
  const tail = screen.tail.slice(-14)
  if (tail.some((line) => WORKING.test(line))) {
    return 'working'
  }
  if (screen.draft && screen.draft.trim() !== '') {
    return 'draft'
  }
  const promptLines = tail.flatMap((line) => {
    const match = PROMPT_LINE.exec(line.trimEnd())
    return match ? [match[1].trim()] : []
  })
  if (promptLines.length === 0) {
    // 입력칸이 안 보이면 선택 창 · 다른 화면일 수 있다. 모르는 화면에는 보내지 않는다.
    return 'unreadable'
  }
  if (promptLines.at(-1) !== '') {
    return 'draft'
  }
  if (tail.slice(-2).some((line) => BACKGROUND.test(line.replace(/shift\+tab/gi, '')))) {
    return 'background'
  }
  if (idleMs > 0 && (lastOutputAt === null || now - lastOutputAt < idleMs)) {
    return 'recent'
  }
  return null
}

function readIdleMs(flags: Map<string, string | boolean>): number {
  const raw = getOptionalStringFlag(flags, 'idle')
  if (raw === undefined) {
    return DEFAULT_IDLE_MINUTES * 60_000
  }
  if (!/^\d+$/.test(raw) || Number(raw) > 24 * 60) {
    throw new RuntimeClientError('invalid_argument', '--idle takes minutes from 0 to 1440.')
  }
  return Number(raw) * 60_000
}

async function sendCompact(client: RuntimeClient, handle: string): Promise<boolean> {
  const status = await client.getCliStatus()
  const supported =
    status.result.runtime.capabilities?.includes(TERMINAL_PROMPT_DELIVERY_RUNTIME_CAPABILITY) ===
    true
  const params = {
    terminal: handle,
    text: COMPACT_TEXT,
    enter: true,
    interrupt: false,
    agentPrompt: true as const,
    client: { id: 'orca-cli', type: 'desktop' }
  }
  const result = await client.call<{ send: { accepted: boolean } }>(
    'terminal.send',
    params,
    supported
      ? { terminalPromptPreflight: { runtimeId: status.result.runtime.runtimeId } }
      : { legacyTerminalPrompt: true as const }
  )
  return result.result.send.accepted
}

async function compactOne(
  client: RuntimeClient,
  session: SessionItem,
  options: { caller: string | undefined; now: number; idleMs: number; dryRun: boolean }
): Promise<CompactItem> {
  const base = { id: session.id, name: session.name }
  if (session.id === options.caller) {
    return { ...base, outcome: 'skipped', reason: 'caller' }
  }
  if (session.agent !== 'claude') {
    return { ...base, outcome: 'skipped', reason: 'not-claude' }
  }
  if (session.state !== 'running') {
    return { ...base, outcome: 'skipped', reason: 'exited' }
  }
  let screen: RuntimeTerminalRead
  try {
    screen = (
      await client.call<{ terminal: RuntimeTerminalRead }>('terminal.read', {
        terminal: session.id,
        screen: true
      })
    ).result.terminal
  } catch {
    return { ...base, outcome: 'skipped', reason: 'unreadable' }
  }
  if (screen.source !== 'screen') {
    return { ...base, outcome: 'skipped', reason: 'unreadable' }
  }
  const reason = compactSkipReason(screen, session.lastOutputAt, options.now, options.idleMs)
  if (reason) {
    return { ...base, outcome: 'skipped', reason }
  }
  if (options.dryRun) {
    return { ...base, outcome: 'would-send' }
  }
  try {
    return (await sendCompact(client, session.id))
      ? { ...base, outcome: 'sent' }
      : { ...base, outcome: 'skipped', reason: 'send-failed' }
  } catch {
    return { ...base, outcome: 'skipped', reason: 'send-failed' }
  }
}

export async function compactLocal(
  client: RuntimeClient,
  options: { only?: string; idleMs: number; dryRun: boolean }
): Promise<CompactItem[]> {
  const { items } = await listLocalSessions(client, undefined)
  const targets = options.only ? items.filter((item) => item.id === options.only) : items
  const caller = process.env.ORCA_TERMINAL_HANDLE
  const now = Date.now()
  const results: CompactItem[] = []
  // 한 세션씩 차례로 보낸다. 요약은 세션마다 모델을 한 번 부르므로 한꺼번에 몰리지 않게 한다.
  for (const session of targets) {
    results.push(await compactOne(client, session, { ...options, caller, now }))
  }
  return results
}

function outcomeLabel(item: CompactItem): string {
  return item.reason ? `${item.outcome} (${item.reason})` : item.outcome
}

export function formatCompact(result: CompactResult): string {
  const withHost = result.hosts !== undefined
  const rows = withHost
    ? (result.hosts ?? []).flatMap((entry) =>
        entry.skipped !== undefined
          ? [[entry.host, '-', skippedHostLabel(entry.skipped), '-']]
          : result.items
              .filter((item) => item.host === entry.host)
              .map((item) => [entry.host, shortId(item.id), item.name, outcomeLabel(item)])
      )
    : result.items.map((item) => [shortId(item.id), item.name, outcomeLabel(item)])
  if (rows.length === 0) {
    return emptyListText()
  }
  return formatTable(
    columnHeaders(withHost ? ['mac', 'id', 'name', 'action'] : ['id', 'name', 'action']),
    rows
  )
}

function forwardedArgs(flags: Map<string, string | boolean>): string[] {
  const args = ['session', 'compact', '--json']
  if (flags.get('dry-run') === true) {
    args.push('--dry-run')
  }
  const idle = getOptionalStringFlag(flags, 'idle')
  if (idle !== undefined) {
    args.push('--idle', idle)
  }
  return args
}

function isCompactItem(value: unknown): value is CompactItem {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const item = Object.fromEntries(Object.entries(value))
  return (
    typeof item.id === 'string' && typeof item.name === 'string' && typeof item.outcome === 'string'
  )
}

async function compactAllHosts(ctx: HandlerContext, idleMs: number, dryRun: boolean) {
  assertMacHostCommands('--all-hosts')
  const macs = await listTailscaleMacs()
  const lists = await Promise.all(
    macs.map(async (mac): Promise<{ host: string; items: CompactItem[]; skipped?: string }> => {
      try {
        if (mac.self) {
          return { host: mac.name, items: await compactLocal(ctx.client, { idleMs, dryRun }) }
        }
        const items = await readRemoteCompact(mac.name, forwardedArgs(ctx.flags))
        if (!Array.isArray(items)) {
          return { host: mac.name, items: [], skipped: 'unexpected reply' }
        }
        return { host: mac.name, items: items.filter(isCompactItem) }
      } catch (error) {
        return {
          host: mac.name,
          items: [],
          skipped: error instanceof Error ? error.message : String(error)
        }
      }
    })
  )
  return {
    items: lists.flatMap((list) => list.items.map((item) => ({ ...item, host: list.host }))),
    hosts: lists.map(({ host, skipped }) => ({ host, ...(skipped !== undefined ? { skipped } : {}) })),
    dryRun
  }
}

export async function compactSessions(ctx: HandlerContext): Promise<void> {
  const idleMs = readIdleMs(ctx.flags)
  const dryRun = ctx.flags.get('dry-run') === true
  const selector = getOptionalStringFlag(ctx.flags, 'session')
  const allHosts = ctx.flags.get('all-hosts') === true
  if (selector && allHosts) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Pass a session or --all-hosts, not both; session ids differ per Mac.'
    )
  }
  let result: CompactResult
  if (allHosts) {
    result = await compactAllHosts(ctx, idleMs, dryRun)
  } else {
    const only = selector
      ? await resolvePromptTerminalSelector(ctx.client, selector, { agentsOnly: true })
      : undefined
    // 하나를 이름으로 고른 때는 쉰 시간을 따지지 않는다. 사람이 그 세션을 콕 집었기 때문이다.
    const items = await compactLocal(ctx.client, {
      ...(only ? { only } : {}),
      idleMs: only ? 0 : idleMs,
      dryRun
    })
    result = { items, dryRun }
  }
  printResult(
    { id: 'session-compact', ok: true, result, _meta: { runtimeId: 'session-compact' } },
    ctx.json,
    formatCompact
  )
}
