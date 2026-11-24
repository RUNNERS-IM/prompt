import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { encodeClaudeProjectPath } from '../ai-vault/claude-project-dir-encoding'
import type { ClaudeRunningSessionEvidence } from '../../shared/claude-running-session-evidence'

const execFileAsync = promisify(execFile)
const PS_TIMEOUT_MS = 5000
const PANE_KEY_PATTERN = /(?:^|\s)ORCA_PANE_KEY=([^\s:]+:[0-9a-fA-F-]{36})(?=\s|$)/

export type ClaudeProcessRow = { pid: number; command: string }

type SessionFile = { pid?: unknown; sessionId?: unknown; cwd?: unknown; updatedAt?: unknown }

/** Running processes named `claude`, each with its full command line and environment. */
async function readClaudeProcessRows(): Promise<ClaudeProcessRow[]> {
  const { stdout: list } = await execFileAsync('ps', ['-axo', 'pid=,comm='], {
    timeout: PS_TIMEOUT_MS
  })
  const pids = list
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => !!match && /(^|\/)claude$/.test(match[2]))
    .map((match) => match[1])
  if (pids.length === 0) {
    return []
  }
  const { stdout } = await execFileAsync(
    'ps',
    ['eww', '-o', 'pid=,command=', '-p', pids.join(',')],
    {
      timeout: PS_TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024
    }
  )
  return stdout
    .split('\n')
    .map((line) => line.match(/^\s*(\d+)\s+(.*)$/))
    .filter((match): match is RegExpMatchArray => !!match)
    .map((match) => ({ pid: Number(match[1]), command: match[2] }))
}

async function readSessionFile(configDir: string, pid: number): Promise<SessionFile | null> {
  try {
    const parsed = JSON.parse(await readFile(join(configDir, 'sessions', `${pid}.json`), 'utf8'))
    return parsed && typeof parsed === 'object' && parsed.pid === pid ? parsed : null
  } catch {
    return null
  }
}

/**
 * Which Prompt pane each running Claude belongs to and which config folder and session it runs.
 * Why not CLAUDE_CONFIG_DIR from the environment: `ps` joins values with spaces, and account
 * folders sit under "Application Support". Claude writes `<config>/sessions/<pid>.json` in the
 * folder it runs on, so the folder holding that pid's file is the answer.
 */
export async function probeClaudeRunningSessions(
  configDirs: readonly string[],
  readRows: () => Promise<ClaudeProcessRow[]> = readClaudeProcessRows
): Promise<ClaudeRunningSessionEvidence[]> {
  if (process.platform === 'win32') {
    return []
  }
  let rows: ClaudeProcessRow[]
  try {
    rows = await readRows()
  } catch {
    return []
  }
  const dirs = [...new Set(configDirs.filter(Boolean))]
  const found: ClaudeRunningSessionEvidence[] = []
  for (const row of rows) {
    const paneKey = row.command.match(PANE_KEY_PATTERN)?.[1]
    if (!paneKey) {
      continue
    }
    let best: { configDir: string; file: SessionFile } | null = null
    for (const configDir of dirs) {
      const file = await readSessionFile(configDir, row.pid)
      // Why newest: a folder can keep a stale file from an earlier process that had the same pid.
      if (file && (!best || Number(file.updatedAt ?? 0) > Number(best.file.updatedAt ?? 0))) {
        best = { configDir, file }
      }
    }
    const sessionId = best?.file.sessionId
    const cwd = best?.file.cwd
    if (!best || typeof sessionId !== 'string' || !sessionId || typeof cwd !== 'string') {
      continue
    }
    found.push({
      paneKey,
      pid: row.pid,
      configDir: best.configDir,
      sessionId,
      cwd,
      transcriptPath: join(
        best.configDir,
        'projects',
        encodeClaudeProjectPath(cwd),
        `${sessionId}.jsonl`
      )
    })
  }
  return found
}
