import { describe, expect, it } from 'vitest'
import {
  isPromptClaudeSessionCopyCommand,
  promptClaudeSessionCopyCommand
} from './prompt-windows'

const ID = 'fb734d47-9c9f-462d-a948-faab45a52682'

describe('Claude session copy command', () => {
  it('resumes the session under a new id', () => {
    expect(promptClaudeSessionCopyCommand(ID)).toBe(`claude --resume ${ID} --fork-session`)
  })

  it('builds nothing from text that is not a session id', () => {
    expect(promptClaudeSessionCopyCommand('abc')).toBeNull()
    expect(promptClaudeSessionCopyCommand(`${ID}; rm -rf ~`)).toBeNull()
  })

  it('lets main run only commands built here', () => {
    expect(isPromptClaudeSessionCopyCommand(`claude --resume ${ID} --fork-session`)).toBe(true)
    expect(isPromptClaudeSessionCopyCommand(`claude --resume ${ID}`)).toBe(false)
    expect(isPromptClaudeSessionCopyCommand(`claude --resume ${ID} --fork-session; ls`)).toBe(false)
    expect(isPromptClaudeSessionCopyCommand('echo hi')).toBe(false)
  })
})
