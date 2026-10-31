import { describe, expect, it } from 'vitest'
import { applyPromptBrand } from './prompt-brand'

describe('applyPromptBrand', () => {
  it('swaps the brand word but keeps identifiers', () => {
    expect(applyPromptBrand('Restart Orca')).toBe('Restart Prompt')
    expect(applyPromptBrand('ORCA_WORKSPACE_NAME and orca.yaml')).toBe(
      'ORCA_WORKSPACE_NAME and orca.yaml'
    )
    expect(applyPromptBrand('Fix ORCA-123')).toBe('Fix ORCA-123')
  })

  it('covers localized spellings', () => {
    expect(applyPromptBrand('Orcas Terminaldienst neu starten')).toBe(
      'Prompts Terminaldienst neu starten'
    )
    expect(applyPromptBrand('Orque indisponible')).toBe('Prompt indisponible')
    expect(applyPromptBrand('오르카는 세션을 두었습니다.')).toBe('프롬프트는 세션을 두었습니다.')
  })

  it('renames the Claude keybinding action in every catalog, but not orca CLI commands', async () => {
    expect(applyPromptBrand('binds Ctrl+Alt+G to command:orca-agent-view.')).toBe(
      'binds Ctrl+Alt+G to command:prompt-agent-view.'
    )
    expect(applyPromptBrand('Run orca status')).toBe('Run orca status')
    const { readdirSync, readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const dir = join(__dirname, '../renderer/src/i18n/locales')
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
      const catalog = JSON.parse(readFileSync(join(dir, file), 'utf8'))
      const hint = catalog.auto.lib.claudeAgentRowView.subagentNavigationSetup as string
      expect(applyPromptBrand(hint), file).toContain('command:prompt-agent-view')
      expect(applyPromptBrand(hint), file).not.toContain('orca-agent-view')
    }
  })

  it('leaves unrelated words alone', () => {
    expect(applyPromptBrand('Orquestación de agentes')).toBe('Orquestación de agentes')
  })
})
