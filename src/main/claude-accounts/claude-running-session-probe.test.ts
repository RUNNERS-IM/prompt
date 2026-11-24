import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { probeClaudeRunningSessions } from './claude-running-session-probe'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

const TAB = '2d7e52cf-e7e0-4f4b-9d55-4d1c6bb1b0aa'
const LEAF = '0b9c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d'

function folder(name: string): string {
  const root = mkdtempSync(join(tmpdir(), 'claude-probe-'))
  roots.push(root)
  const dir = join(root, 'Application Support', name, 'home')
  mkdirSync(join(dir, 'sessions'), { recursive: true })
  return dir
}

function sessionFile(dir: string, pid: number, fields: Record<string, unknown>): void {
  writeFileSync(join(dir, 'sessions', `${pid}.json`), JSON.stringify({ pid, ...fields }))
}

describe.skipIf(process.platform === 'win32')('probeClaudeRunningSessions', () => {
  it('names the folder holding the pid file, even when its path has spaces', async () => {
    const account = folder('acct')
    const other = folder('other')
    sessionFile(account, 41, { sessionId: 's-new', cwd: '/Users/me/git/app', updatedAt: 9 })
    sessionFile(other, 41, { sessionId: 's-stale', cwd: '/Users/me', updatedAt: 1 })
    const found = await probeClaudeRunningSessions([other, account], async () => [
      {
        pid: 41,
        command: `claude --resume x CLAUDE_CONFIG_DIR=${account} ORCA_PANE_KEY=${TAB}:${LEAF} TERM=xterm`
      }
    ])
    expect(found).toEqual([
      {
        paneKey: `${TAB}:${LEAF}`,
        pid: 41,
        configDir: account,
        sessionId: 's-new',
        cwd: '/Users/me/git/app',
        transcriptPath: join(account, 'projects', '-Users-me-git-app', 's-new.jsonl')
      }
    ])
  })

  it('skips processes outside a Prompt pane and pid files of another process', async () => {
    const account = folder('acct')
    sessionFile(account, 7, { sessionId: 's', cwd: '/x' })
    writeFileSync(join(account, 'sessions', '8.json'), JSON.stringify({ pid: 99, sessionId: 's' }))
    const found = await probeClaudeRunningSessions([account], async () => [
      { pid: 7, command: 'claude TERM=xterm' },
      { pid: 8, command: `claude ORCA_PANE_KEY=${TAB}:${LEAF}` }
    ])
    expect(found).toEqual([])
  })

  it('returns nothing when the process table cannot be read', async () => {
    await expect(
      probeClaudeRunningSessions(['/nowhere'], async () => {
        throw new Error('ps failed')
      })
    ).resolves.toEqual([])
  })
})
