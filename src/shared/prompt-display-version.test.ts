import { describe, expect, it } from 'vitest'
import { formatPromptDisplayVersion } from './prompt-display-version'

describe('formatPromptDisplayVersion', () => {
  it('drops the first build number and keeps later ones', () => {
    expect(formatPromptDisplayVersion('2.6.103001')).toBe('2.6.1030')
    expect(formatPromptDisplayVersion('2.6.103002')).toBe('2.6.1030.2')
    expect(formatPromptDisplayVersion('2.6.103012')).toBe('2.6.1030.12')
  })

  it('reads one-digit months', () => {
    expect(formatPromptDisplayVersion('2.6.10501')).toBe('2.6.105')
    expect(formatPromptDisplayVersion('2.6.10503')).toBe('2.6.105.3')
    expect(formatPromptDisplayVersion('2.6.13001')).toBe('2.6.130')
  })

  it('leaves other versions as they are', () => {
    for (const version of [
      '1.4.214-local.20261030',
      '1.4.244',
      '2.6.103002-rc.1',
      '2.6.133001',
      '2.6.103200',
      '2.6.103000',
      'unknown',
      ''
    ]) {
      expect(formatPromptDisplayVersion(version)).toBe(version)
    }
  })
})
