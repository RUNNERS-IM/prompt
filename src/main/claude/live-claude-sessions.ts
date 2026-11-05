// Which conversation each running Claude process holds, read from the processes themselves.
// Hook rows miss Claude started by hand or by an older app run; the process table does not.
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { runProcess } from '@orca/process-host'

export type LiveClaudeSession = {
  pid: number
  /** `tabId:leafId` of the Prompt pane the process runs in; null outside Prompt panes. */
  paneKey: string | null
  terminalHandle: string | null
  /** The conversation the process writes now; a fork or in-app /resume differs from its argv. */
  sessionId: string | null
  name: string | null
}

type ClaudeProcessRow = {
  pid: number
  paneKey: string | null
  terminalHandle: string | null
  configDir: string | null
  argvSessionId: string | null
}

const PS_TIMEOUT_MS = 2_000
// Environments of every process are listed; a busy Mac reaches a few hundred KiB.
const PS_MAX_OUTPUT_BYTES = 32 * 1024 * 1024
// Spawn checks of one restore burst share one process read.
const CACHE_MS = 1_000

const ENV_TOKEN = /^[A-Z_][A-Z0-9_]*=/

/** Splits a `ps eww` command column into argv words and trailing environment variables. */
function splitArgvAndEnv(column: string): { argv: string[]; env: Map<string, string> } {
  const argv: string[] = []
  const env = new Map<string, string>()
  let current: string | null = null
  for (const token of column.split(/\s+/).filter(Boolean)) {
    if (argv.length > 0 && ENV_TOKEN.test(token)) {
      const at = token.indexOf('=')
      current = token.slice(0, at)
      env.set(current, token.slice(at + 1))
    } else if (current !== null) {
      // ps joins with spaces, so a value with spaces (Application Support) spans tokens.
      env.set(current, `${env.get(current)} ${token}`)
    } else {
      argv.push(token)
    }
  }
  return { argv, env }
}

function isClaudeArgv(argv: readonly string[]): boolean {
  const program = basename(argv[0] ?? '')
  if (program === 'claude') {
    return true
  }
  // npm installs run as `node …/claude-code/cli.js` or `node …/bin/claude`.
  return (
    (program === 'node' || program === 'bun') &&
    /(^|\/)claude$|claude-code\/cli\.m?js$/.test(argv[1] ?? '')
  )
}

/** The conversation a Claude argv names: `--session-id` wins, `--resume` unless it forks. */
export function claudeArgvSessionId(argv: readonly string[]): string | null {
  let resumed: string | null = null
  let sessionId: string | null = null
  let forked = false
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i]
    const [flag, inline] = word.startsWith('--') ? word.split(/=(.*)/s, 2) : [word, undefined]
    const value = inline ?? argv[i + 1]
    if (flag === '--fork-session') {
      forked = true
    } else if (flag === '--resume' || flag === '-r') {
      resumed = value && !value.startsWith('-') ? value : null
    } else if (flag === '--session-id') {
      sessionId = value && !value.startsWith('-') ? value : null
    }
  }
  return sessionId ?? (forked ? null : resumed)
}

/** Claude processes in `ps eww -A -o pid=,command=` output. */
export function parseClaudeProcessTable(psOutput: string): ClaudeProcessRow[] {
  const rows: ClaudeProcessRow[] = []
  for (const line of psOutput.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(.*)$/)
    if (!match) {
      continue
    }
    const { argv, env } = splitArgvAndEnv(match[2])
    if (!isClaudeArgv(argv)) {
      continue
    }
    rows.push({
      pid: Number(match[1]),
      paneKey: env.get('ORCA_AGENT_PANE')?.trim() || null,
      terminalHandle: env.get('ORCA_TERMINAL_HANDLE')?.trim() || null,
      configDir: env.get('CLAUDE_CONFIG_DIR')?.trim() || null,
      argvSessionId: claudeArgvSessionId(argv)
    })
  }
  return rows
}

/** Claude keeps `<config>/sessions/<pid>.json` naming the conversation the process writes. */
async function readClaudePidRecord(
  row: ClaudeProcessRow
): Promise<{ sessionId: string | null; name: string | null } | null> {
  const path = join(row.configDir ?? join(homedir(), '.claude'), 'sessions', `${row.pid}.json`)
  try {
    const record: unknown = JSON.parse(await readFile(path, 'utf8'))
    // A leftover file from a reused pid names another process's conversation.
    if (
      typeof record !== 'object' ||
      record === null ||
      !('pid' in record) ||
      record.pid !== row.pid
    ) {
      return null
    }
    const sessionId = 'sessionId' in record ? record.sessionId : null
    const name = 'name' in record ? record.name : null
    return {
      sessionId: typeof sessionId === 'string' ? sessionId : null,
      name: typeof name === 'string' && name.trim() ? name.trim() : null
    }
  } catch {
    return null
  }
}

async function readLiveClaudeSessions(): Promise<LiveClaudeSession[]> {
  if (process.platform === 'win32') {
    return []
  }
  const result = await runProcess({
    program: 'ps',
    args: ['eww', '-A', '-o', 'pid=,command='],
    env: { ...process.env, LANG: 'C', LC_ALL: 'C' },
    timeoutMs: PS_TIMEOUT_MS,
    maxOutputBytes: PS_MAX_OUTPUT_BYTES
  })
  if (result.timedOut || result.code !== 0) {
    throw new Error('claude_process_table_unreadable')
  }
  return await Promise.all(
    parseClaudeProcessTable(result.stdout).map(async (row) => {
      const record = await readClaudePidRecord(row)
      return {
        pid: row.pid,
        paneKey: row.paneKey,
        terminalHandle: row.terminalHandle,
        sessionId: record?.sessionId ?? row.argvSessionId,
        name: record?.name ?? null
      }
    })
  )
}

let cached: { at: number; read: Promise<LiveClaudeSession[]> } | null = null
let lastSessionIdByPane = new Map<string, string>()

/** Rejects when the process table cannot be read; callers decide what unknown means. */
export function listLiveClaudeSessions(): Promise<LiveClaudeSession[]> {
  const now = Date.now()
  if (!cached || now - cached.at > CACHE_MS) {
    const read = readLiveClaudeSessions()
    cached = { at: now, read }
    void read.then(
      (sessions) => {
        if (cached?.read === read) {
          lastSessionIdByPane = new Map(
            sessions.flatMap((session) =>
              session.paneKey && session.sessionId ? [[session.paneKey, session.sessionId]] : []
            )
          )
        }
      },
      () => {}
    )
    read.catch(() => {
      if (cached?.read === read) {
        cached = null
      }
    })
  }
  return cached.read
}

/** Resumes this app started whose process may not exist yet, by session id. */
const startingResumes = new Map<string, { paneKey: string | null; until: number }>()
// Long enough for a shell-ready startup command to start Claude and write its pid record.
const STARTING_RESUME_MS = 20_000

/** Another live holder of this Claude conversation than `ownPaneKey`, or null. */
export async function findClaudeSessionHolderElsewhere(
  sessionId: string,
  ownPaneKey: string | null
): Promise<{ paneKey: string | null; name: string | null } | null> {
  const now = Date.now()
  const starting = startingResumes.get(sessionId)
  if (starting && starting.until > now && starting.paneKey !== ownPaneKey) {
    return { paneKey: starting.paneKey, name: null }
  }
  const sessions = await listLiveClaudeSessions()
  const holder = sessions.find(
    (session) =>
      session.sessionId === sessionId && (ownPaneKey === null || session.paneKey !== ownPaneKey)
  )
  return holder ? { paneKey: holder.paneKey, name: holder.name } : null
}

/** Holds the conversation for a resume about to start, so an overlapping restore sees it. */
export function noteClaudeResumeStarting(sessionId: string, paneKey: string | null): void {
  const now = Date.now()
  for (const [id, entry] of startingResumes) {
    if (entry.until <= now) {
      startingResumes.delete(id)
    }
  }
  startingResumes.set(sessionId, { paneKey, until: now + STARTING_RESUME_MS })
}

/** The conversation the pane's Claude process wrote at the last process read. */
export function lastLiveClaudeSessionIdForPane(paneKey: string): string | null {
  return lastSessionIdByPane.get(paneKey) ?? null
}

/** Refreshes the pane-to-conversation map for synchronous readers; never rejects. */
export async function refreshLiveClaudeSessions(): Promise<void> {
  await listLiveClaudeSessions().catch(() => undefined)
}

export function resetLiveClaudeSessionsForTests(): void {
  cached = null
  lastSessionIdByPane = new Map()
  startingResumes.clear()
}
