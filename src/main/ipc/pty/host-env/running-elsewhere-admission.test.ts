import { beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { admitClaudeResumeElsewhere, claudeResumeTarget } from './running-elsewhere-admission'
import { parseClaudeProcessTable } from '../../../claude/live-claude-sessions'

const runProcess = vi.hoisted(() => vi.fn())
vi.mock('@orca/process-host', () => ({ runProcess }))
const readFile = vi.hoisted(() => vi.fn())
vi.mock('node:fs/promises', () => ({ readFile }))

const RUNNING = 'f68ee0f1-f10c-4e1f-a6aa-08a106fad048'
const PANE_A = '948c1ff8-727c-4482-a62f-c80527470cad:720b9a91-524a-4cc2-b1e8-da4f43d5152f'
const PANE_B = '95904e12-bab1-42f5-9baf-a2081c02fad0:7f11cc1c-69ff-4acc-99e4-56e22105558f'

// Real `ps eww` rows: argv, then environment; plugin paths carry spaces.
const PS_TABLE = [
  `31778 claude --plugin-dir /Users/me/Library/Application Support/Prompt/x --resume ${RUNNING} TERM=xterm ORCA_AGENT_PANE=${PANE_A} ORCA_TERMINAL_HANDLE=term_8b5d CLAUDE_CONFIG_DIR=/Users/me/Library/Application Support/claude`,
  `46624 claude --resume ${RUNNING} --fork-session ORCA_AGENT_PANE=${PANE_B}`,
  `500 /bin/zsh -l ORCA_AGENT_PANE=${PANE_B}`,
  `600 node /usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js -r abc PATH=/bin`
].join('\n')

beforeAll(() => {
  vi.useFakeTimers()
})

beforeEach(() => {
  // Each case starts past the process-read cache and any earlier starting resume.
  vi.advanceTimersByTime(60_000)
  runProcess.mockReset().mockResolvedValue({ code: 0, stdout: PS_TABLE, timedOut: false })
  readFile.mockReset().mockImplementation(async (path: string) => {
    if (path.endsWith('/Application Support/claude/sessions/31778.json')) {
      return JSON.stringify({ pid: 31778, sessionId: RUNNING, name: '[SENSE] 수집기' })
    }
    if (path.endsWith('/sessions/46624.json')) {
      return JSON.stringify({ pid: 46624, sessionId: 'c9c596eb', name: '[SENSE] 스튜디오' })
    }
    throw Object.assign(new Error('missing'), { code: 'ENOENT' })
  })
})

it('reads pane, handle, config dir and argv conversation of Claude processes only', () => {
  expect(parseClaudeProcessTable(PS_TABLE)).toEqual([
    {
      pid: 31778,
      paneKey: PANE_A,
      terminalHandle: 'term_8b5d',
      configDir: '/Users/me/Library/Application Support/claude',
      argvSessionId: RUNNING
    },
    { pid: 46624, paneKey: PANE_B, terminalHandle: null, configDir: null, argvSessionId: null },
    { pid: 600, paneKey: null, terminalHandle: null, configDir: null, argvSessionId: 'abc' }
  ])
})

it.each([
  [{ command: `claude --resume ${RUNNING}` }, RUNNING],
  [{ command: `'/opt/homebrew/bin/claude' --resume=${RUNNING}` }, RUNNING],
  [{ command: `claude --resume ${RUNNING} --fork-session` }, null],
  [{ command: 'claude' }, null],
  [{ command: `codex resume ${RUNNING}` }, null],
  [
    {
      launchAgent: 'claude' as const,
      resumeProviderSession: { key: 'session_id' as const, id: RUNNING }
    },
    RUNNING
  ],
  [{ launchAgent: 'codex' as const, command: `claude --resume ${RUNNING}` }, null]
])('finds the resumed Claude conversation of %j', (args, expected) => {
  expect(claudeResumeTarget(args)).toBe(expected)
})

it('refuses a second terminal on a conversation another pane writes, naming that pane', async () => {
  await expect(
    admitClaudeResumeElsewhere({ command: `claude --resume ${RUNNING}` }, PANE_B, null)
  ).resolves.toMatchObject({
    verdict: 'running-elsewhere',
    holder: { paneKey: PANE_A, name: '[SENSE] 수집기' }
  })
})

it('lets the holding pane itself resume, and judges a fork by the conversation it writes', async () => {
  await expect(
    admitClaudeResumeElsewhere({ command: `claude --resume ${RUNNING}` }, PANE_A, null)
  ).resolves.toBeNull()
  await expect(
    admitClaudeResumeElsewhere({ command: 'claude --resume c9c596eb' }, PANE_A, null)
  ).resolves.toMatchObject({ holder: { paneKey: PANE_B } })
})

it('refuses the second of two restores starting before either process exists', async () => {
  runProcess.mockResolvedValue({ code: 0, stdout: '', timedOut: false })
  const args = { command: 'claude --resume not-started-yet' }
  await expect(admitClaudeResumeElsewhere(args, PANE_A, null)).resolves.toBeNull()
  await expect(admitClaudeResumeElsewhere(args, PANE_B, null)).resolves.toMatchObject({
    holder: { paneKey: PANE_A }
  })
})

it('starts as before when the process table cannot be read or the start is remote', async () => {
  runProcess.mockResolvedValue({ code: 1, stdout: '', timedOut: false })
  await expect(
    admitClaudeResumeElsewhere({ command: `claude --resume ${RUNNING}x` }, PANE_B, null)
  ).resolves.toBeNull()
  await expect(
    admitClaudeResumeElsewhere(
      { command: `claude --resume ${RUNNING}`, connectionId: 'ssh-1' },
      PANE_B,
      null
    )
  ).resolves.toBeNull()
})
