import { describe, expect, it } from 'vitest'
import type { RuntimeClientError } from '../runtime/types'
import { matchSelector } from './prompt-selectors'

const CANDIDATES = [
  { id: 'term_abcdef0123456789', name: 'build' },
  { id: 'term_abcdef9999999999', name: 'Build' },
  { id: 'term_123456aaaaaaaaaa', name: 'deploy', otherIds: ['b5f0c1d2-resume'] }
]

function ambiguity(selector: string): RuntimeClientError {
  try {
    matchSelector(selector, CANDIDATES, 'terminal')
  } catch (error) {
    return error as RuntimeClientError
  }
  throw new Error('expected an ambiguity')
}

describe('matchSelector', () => {
  it('prefers an exact full id over any other match', () => {
    expect(matchSelector('term_abcdef0123456789', CANDIDATES, 'terminal')?.name).toBe('build')
  })

  it('matches an exact name before a case-insensitive one', () => {
    expect(matchSelector('build', CANDIDATES, 'terminal')?.id).toBe('term_abcdef0123456789')
  })

  it('accepts a short id prefix of six or more characters, with or without term_', () => {
    expect(matchSelector('123456', CANDIDATES, 'terminal')?.name).toBe('deploy')
    expect(matchSelector('term_123456', CANDIDATES, 'terminal')?.name).toBe('deploy')
    expect(matchSelector('12345', CANDIDATES, 'terminal')).toBeNull()
  })

  it('matches other ids such as a resume id', () => {
    expect(matchSelector('b5f0c1d2-resume', CANDIDATES, 'terminal')?.name).toBe('deploy')
    expect(matchSelector('b5f0c1', CANDIDATES, 'terminal')?.name).toBe('deploy')
  })

  it('refuses a prefix shared by several candidates and lists them', () => {
    const error = ambiguity('abcdef')
    expect(error.code).toBe('ambiguous')
    expect(error.message).toContain('matches 2 terminals; nothing was changed.')
    expect(error.message).toContain('abcdef01  build')
    expect(error.message).toContain('abcdef99  Build')
  })

  it('returns null when nothing matches', () => {
    expect(matchSelector('nope', CANDIDATES, 'terminal')).toBeNull()
  })
})
