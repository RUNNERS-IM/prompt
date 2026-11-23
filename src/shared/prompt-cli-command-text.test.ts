import { describe, expect, it } from 'vitest'
import { promptCliCommandText } from './prompt-cli-command-text'

describe('promptCliCommandText', () => {
  it('names `prompt` where a hint tells someone to type an orca command', () => {
    expect(promptCliCommandText('Run `orca terminal focus --terminal t1` to reveal it.')).toBe(
      'Run `prompt terminal focus --terminal t1` to reveal it.'
    )
    expect(promptCliCommandText("Orca is not running. Run 'orca open' first.")).toBe(
      "Orca is not running. Run 'prompt open' first."
    )
    expect(promptCliCommandText('Prompt terminals already have `orca`.')).toBe(
      'Prompt terminals already have `prompt`.'
    )
    expect(promptCliCommandText('orca --help')).toBe('prompt --help')
  })

  it('leaves paths, files, links, other commands and the brand as written', () => {
    for (const text of [
      'Edit orca.yaml in the repo root.',
      'Keys live in ~/.orca/keybindings.json.',
      'Remove /usr/local/bin/orca.',
      'Run `orca-ide terminal list`.',
      'Paste orca://pair?code=abc',
      'ORCA_CLI_COMMAND stays set.',
      'Orca hit a renderer error.',
      'Ask ORCA-123 about it.'
    ]) {
      expect(promptCliCommandText(text)).toBe(text)
    }
  })
})
