import { describe, expect, it } from 'vitest'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import { getDefaultSettings } from '../../../shared/constants'
import { promptTerminalThemeMigration } from './prompt-terminal-theme-default'

const settings = (terminalThemeDark: string): GlobalSettings =>
  ({ ...getDefaultSettings('/home'), terminalThemeDark }) as GlobalSettings

describe('promptTerminalThemeMigration', () => {
  it('waits until settings load', () => {
    expect(promptTerminalThemeMigration(null)).toBeUndefined()
  })

  it('moves the saved Orca default to Prompt Dark', () => {
    expect(promptTerminalThemeMigration(settings('Ghostty Default Style Dark'))).toEqual({
      terminalThemeDark: 'Prompt Dark'
    })
  })

  it('keeps a theme the user picked', () => {
    expect(promptTerminalThemeMigration(settings('Dracula'))).toBeNull()
    expect(promptTerminalThemeMigration(settings('Prompt Dark'))).toBeNull()
  })
})
