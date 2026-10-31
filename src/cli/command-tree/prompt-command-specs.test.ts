import { describe, expect, it } from 'vitest'
import { specPaths } from '../command-spec'
import { COMMAND_SPECS } from '../specs'
import { buildHandlerRoutes } from '../dispatch'
import { HANDLER_GROUPS } from '../handler-group-manifest'
import { replacementForLegacyPath } from './command-moves'
import { PROMPT_COMMAND_SPECS, rewriteLegacyCommandText } from './prompt-command-specs'
import { PROMPT_GROUPS } from './prompt-help'

describe('prompt command tree', () => {
  it('gives every command path and alias exactly one owner', () => {
    const owners = new Map<string, string[]>()
    for (const spec of PROMPT_COMMAND_SPECS) {
      for (const path of specPaths(spec)) {
        const key = path.join(' ')
        owners.set(key, [...(owners.get(key) ?? []), spec.path.join(' ')])
      }
    }
    expect([...owners].filter(([, specs]) => specs.length > 1)).toEqual([])
  })

  it('places every command under one of the documented groups', () => {
    const groups = new Set(PROMPT_GROUPS.map(([name]) => name))
    expect(groups.size).toBe(15)
    expect(PROMPT_COMMAND_SPECS.filter((spec) => !groups.has(spec.path[0]))).toEqual([])
  })

  it('names a replacement for every legacy command', () => {
    expect(COMMAND_SPECS.filter((spec) => replacementForLegacyPath(spec.path) === null)).toEqual([])
  })

  it('routes every prompt command to a registered handler', () => {
    const routes = buildHandlerRoutes(HANDLER_GROUPS)
    const unroutable = PROMPT_COMMAND_SPECS.map((spec) =>
      (spec.handlerPath ?? spec.path).join(' ')
    ).filter((key) => !routes.has(key))
    expect(unroutable).toEqual([])
  })

  it('shows workspace and project flags where the moved handler reads worktree and repo', () => {
    const spec = PROMPT_COMMAND_SPECS.find(
      (candidate) => candidate.path.join(' ') === 'project refs'
    )
    expect(spec?.handlerPath).toEqual(['repo', 'search-refs'])
    expect(spec?.flagAliases).toEqual({ project: 'repo' })
    expect(spec?.usage).toContain('prompt project refs --project <selector>')
  })

  it('rewrites legacy command mentions in help text', () => {
    expect(rewriteLegacyCommandText('Run `orca worktree list` first.')).toBe(
      'Run `prompt workspace list` first.'
    )
    expect(rewriteLegacyCommandText('orca repo show --repo id:1')).toBe(
      'prompt project show --repo id:1'
    )
    // Not the executable: file names and env vars keep their spelling.
    expect(rewriteLegacyCommandText('see .orca/config and ORCA_TERMINAL_HANDLE')).toBe(
      'see .orca/config and ORCA_TERMINAL_HANDLE'
    )
  })
})
