import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PromptClaudeLoginEvent } from '../../shared/prompt-claude-login-sync'
import {
  createPromptClaudeRenameWatch,
  hasClaudeLoginSucceeded
} from './prompt-claude-rename-watch'

const SESSION = 'session-1'

function userLine(content: string, sessionId = SESSION): string {
  return `${JSON.stringify({ type: 'user', message: { role: 'user', content }, sessionId })}\n`
}

const LOGIN_COMMAND = userLine(
  '<command-name>/login</command-name>\n<command-message>login</command-message>\n<command-args></command-args>'
)
const LOGIN_SUCCEEDED = userLine('<local-command-stdout>Login successful</local-command-stdout>')

describe('hasClaudeLoginSucceeded', () => {
  it('finds the success record of this session only', () => {
    expect(hasClaudeLoginSucceeded(LOGIN_COMMAND + LOGIN_SUCCEEDED, SESSION)).toBe(true)
    expect(hasClaudeLoginSucceeded(LOGIN_COMMAND, SESSION)).toBe(false)
    expect(
      hasClaudeLoginSucceeded(
        userLine('<local-command-stdout>Login successful</local-command-stdout>', 'session-2'),
        SESSION
      )
    ).toBe(false)
  })

  it('ignores the phrase quoted inside a normal message', () => {
    const quoted = userLine('Why does it print <local-command-stdout>Login successful?')
    expect(hasClaudeLoginSucceeded(quoted, SESSION)).toBe(false)
    const assistant = `${JSON.stringify({
      type: 'assistant',
      message: { content: '<local-command-stdout>Login successful' },
      sessionId: SESSION
    })}\n`
    expect(hasClaudeLoginSucceeded(assistant, SESSION)).toBe(false)
  })
})

describe('createPromptClaudeRenameWatch login', () => {
  let dir: string
  let transcriptPath: string
  let logins: PromptClaudeLoginEvent[]

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'prompt-login-watch-'))
    transcriptPath = join(dir, `${SESSION}.jsonl`)
    writeFileSync(transcriptPath, LOGIN_COMMAND + LOGIN_SUCCEEDED)
    logins = []
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports a login appended after it starts watching, not the history', async () => {
    const watch = createPromptClaudeRenameWatch({
      listTargets: () => [{ paneKey: 'tab-1:leaf-1', sessionId: SESSION, transcriptPath }],
      onTitle: () => {},
      onLogin: (event) => logins.push(event),
      every: () => () => {}
    })
    watch.reconcile()
    await watch.poll()
    expect(logins).toEqual([])

    appendFileSync(transcriptPath, LOGIN_COMMAND + LOGIN_SUCCEEDED)
    await watch.poll()
    expect(logins).toEqual([{ paneKey: 'tab-1:leaf-1', sessionId: SESSION }])

    await watch.poll()
    expect(logins).toHaveLength(1)
    watch.stop()
  })
})
