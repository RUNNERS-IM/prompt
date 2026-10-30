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

  it('leaves unrelated words alone', () => {
    expect(applyPromptBrand('Orquestación de agentes')).toBe('Orquestación de agentes')
  })
})
