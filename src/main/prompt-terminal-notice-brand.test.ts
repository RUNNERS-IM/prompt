import { describe, expect, it } from 'vitest'
import { startupStagingFailureNotice } from '../shared/startup-command-staging'
import { CONPTY_NO_INPUT_READER_NOTICE } from './daemon/pty-subprocess/conpty-startup-input-reader'
import { buildWindowsRunnerScript } from './setup-runner-script-text'
import { WSL_MANAGED_CLI_PATH_RESTORE } from './wsl-managed-cli-path-restore'

// Lines Prompt itself types or prints into a user's terminal must carry the Prompt name.
describe('terminal notices', () => {
  const notices = {
    staging: startupStagingFailureNotice({
      command: 'claude',
      delivery: 'typed-after-stage-failed',
      failure: 'ENOSPC'
    }),
    conpty: CONPTY_NO_INPUT_READER_NOTICE,
    setupRefusal: buildWindowsRunnerScript('#!/bin/sh\necho hi\n'),
    wslCli: WSL_MANAGED_CLI_PATH_RESTORE
  }

  it.each(Object.entries(notices))('%s names Prompt, not Orca', (_name, text) => {
    expect(text).toContain('Prompt')
    expect(text).not.toMatch(/\[orca\]|\bOrca\b/)
  })

  it('keeps the exact prefixes users see', () => {
    expect(notices.staging).toContain('[Prompt] Could not stage the launch command (ENOSPC)')
    expect(notices.conpty).toContain('[Prompt] Windows could not start keyboard input')
    expect(notices.setupRefusal).toContain('echo Prompt setup: this script starts with')
    expect(notices.wslCli).toContain("printf 'Prompt CLI unavailable: cannot run %s.")
  })
})
