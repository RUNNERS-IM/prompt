import { describe, expect, it } from 'vitest'
import {
  migrateAgentYoloDefaults,
  migrateKoreanTerminalFontDefault
} from './terminal-settings-migrations'

describe('migrateAgentYoloDefaults', () => {
  it('keeps newly added agent defaults manual for already migrated profiles', () => {
    const migrated = migrateAgentYoloDefaults({
      agentYoloDefaultsMigrated: true,
      agentDefaultArgs: { claude: '--dangerously-skip-permissions' },
      agentDefaultEnv: {}
    } as never)

    expect(migrated.agentDefaultArgs?.droid).toBe('')
    expect(migrated.agentDefaultEnv?.goose).toEqual({})
  })

  it('updates the previous Devin default for existing profiles', () => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: This test only supplies the settings fields consumed by this migration.
    const migrated = migrateAgentYoloDefaults({
      agentYoloDefaultsMigrated: true,
      agentDefaultArgs: { devin: '--permission-mode bypass' },
      agentDefaultEnv: {}
    } as never)

    expect(migrated.agentDefaultArgs?.devin).toBe(
      '--permission-mode bypass --respect-workspace-trust false'
    )
  })
})

describe('migrateKoreanTerminalFontDefault', () => {
  it('moves a Korean profile on the old SF Mono default to D2Coding at 15', () => {
    expect(
      migrateKoreanTerminalFontDefault({ terminalFontFamily: 'SF Mono', terminalFontSize: 14 }, true)
    ).toEqual({
      settings: {
        terminalFontFamily: 'D2Coding',
        terminalFontSize: 15,
        terminalFontKoreanDefaultApplied: true
      },
      needsSave: true
    })
  })

  it('keeps a size the user changed while moving the font', () => {
    expect(
      migrateKoreanTerminalFontDefault({ terminalFontFamily: 'SF Mono', terminalFontSize: 18 }, true)
        .settings
    ).toEqual({ terminalFontFamily: 'D2Coding', terminalFontKoreanDefaultApplied: true })
  })

  it('keeps a font the user picked and only stamps the guard', () => {
    expect(
      migrateKoreanTerminalFontDefault({ terminalFontFamily: 'JetBrains Mono' }, true)
    ).toEqual({ settings: { terminalFontKoreanDefaultApplied: true }, needsSave: true })
  })

  it('leaves non-Korean profiles on their font', () => {
    expect(migrateKoreanTerminalFontDefault({ terminalFontFamily: 'SF Mono' }, false)).toEqual({
      settings: { terminalFontKoreanDefaultApplied: true },
      needsSave: true
    })
  })

  it('runs only once, so a later switch back to SF Mono stays', () => {
    expect(
      migrateKoreanTerminalFontDefault(
        { terminalFontFamily: 'SF Mono', terminalFontKoreanDefaultApplied: true },
        true
      )
    ).toEqual({ settings: { terminalFontKoreanDefaultApplied: true }, needsSave: false })
  })
})
