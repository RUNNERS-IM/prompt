import { describe, expect, it, vi } from 'vitest'
import type { AgentLaunchResult } from '../shared/agent-launch-intent'
import { nameLaunchedSession, readAgentLaunchName } from './agent-launch-name'
import type { RuntimeClient, RuntimeRpcSuccess } from './runtime-client'

const launched = {
  id: '1',
  ok: true,
  result: { outcome: { kind: 'terminal', handle: 'term_a' } },
  _meta: { runtimeId: 'r' }
} as unknown as RuntimeRpcSuccess<AgentLaunchResult> // SAFETY: only outcome.handle and warning are read.

function client(satisfied: boolean): { client: RuntimeClient; call: ReturnType<typeof vi.fn> } {
  const call = vi.fn(async (method: string) =>
    method === 'terminal.wait' ? { result: { wait: { satisfied } } } : { result: {} }
  )
  return {
    call,
    client: {
      call,
      getCliStatus: async () => ({ result: { runtime: { capabilities: [], runtimeId: 'r' } } })
    } as unknown as RuntimeClient // SAFETY: the two methods the naming path uses.
  }
}

describe('nameLaunchedSession', () => {
  it('names the tab, then renames inside Claude once ready', async () => {
    const fake = client(true)
    await nameLaunchedSession(fake.client, launched, 'claude', '[RUNNERS] 사주맵')
    expect(fake.call.mock.calls.map(([method]) => method)).toEqual([
      'terminal.rename',
      'terminal.wait',
      'terminal.send'
    ])
    expect(fake.call.mock.calls[2][1]).toMatchObject({
      text: '/rename [RUNNERS] 사주맵',
      enter: true
    })
  })

  it('warns instead of typing into a Claude that is not ready', async () => {
    const fake = client(false)
    const result = await nameLaunchedSession(fake.client, launched, 'claude', 'x')
    expect(fake.call.mock.calls.map(([method]) => method)).not.toContain('terminal.send')
    expect(result.result.warning).toMatch(/not ready/)
  })

  it('does not type /rename into other agents', async () => {
    const fake = client(true)
    await nameLaunchedSession(fake.client, launched, 'codex', 'x')
    expect(fake.call.mock.calls.map(([method]) => method)).toEqual(['terminal.rename'])
  })
})

describe('readAgentLaunchName', () => {
  it('rejects a newline, which would submit the rename early', () => {
    expect(() => readAgentLaunchName(new Map([['name', 'a\nb']]))).toThrow(/single line/)
  })
})
