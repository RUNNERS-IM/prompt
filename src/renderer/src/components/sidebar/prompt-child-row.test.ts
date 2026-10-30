import { describe, expect, it } from 'vitest'
import type { AgentChildRowModel } from '../../../../shared/agent-child-row-model'
import { promptChildRowWithoutRoleTail } from './prompt-child-row'

const row = (detail: AgentChildRowModel['detail']): AgentChildRowModel =>
  ({
    name: 'Fix tests',
    displayState: 'working',
    detail
  }) as AgentChildRowModel

describe('promptChildRowWithoutRoleTail', () => {
  it('drops the role tail such as "general-purpose"', () => {
    expect(
      promptChildRowWithoutRoleTail(row({ kind: 'role', agentType: 'general-purpose' })).detail
    ).toBeNull()
  })

  it('keeps any other detail', () => {
    const operation = row({ kind: 'operation', toolName: 'Bash', input: 'ls' })
    expect(promptChildRowWithoutRoleTail(operation)).toBe(operation)
    const ended = row({ kind: 'ended' })
    expect(promptChildRowWithoutRoleTail(ended)).toBe(ended)
  })
})
