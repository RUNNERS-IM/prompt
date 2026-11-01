import { describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'

vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))

import { pickPromptClaudeResumeSessions } from './prompt-claude-start-resume'

function session(id: string, extra: Partial<AiVaultSession> = {}): AiVaultSession {
  return {
    id,
    sessionId: `s-${id}`,
    agent: 'claude',
    title: id,
    cwd: '/repo/app',
    modifiedAt: '2026-10-01T00:00:00Z',
    subagent: null,
    ...extra
  } as AiVaultSession
}

describe('pickPromptClaudeResumeSessions', () => {
  it('keeps the newest three Claude conversations from this folder', () => {
    const picked = pickPromptClaudeResumeSessions(
      [
        session('old', { modifiedAt: '2026-09-01T00:00:00Z' }),
        session('newest', { modifiedAt: '2026-10-30T00:00:00Z' }),
        session('mid', { modifiedAt: '2026-10-20T00:00:00Z' }),
        session('slash', { cwd: '/repo/app/', modifiedAt: '2026-10-10T00:00:00Z' })
      ],
      '/repo/app'
    )
    expect(picked.map((entry) => entry.id)).toEqual(['newest', 'mid', 'slash'])
  })

  it('skips other folders, other agents, subagents and chat-owned rows', () => {
    const picked = pickPromptClaudeResumeSessions(
      [
        session('elsewhere', { cwd: '/repo/other' }),
        session('codex', { agent: 'codex' }),
        session('sub', { subagent: {} as AiVaultSession['subagent'] }),
        session('chat', { structuredSession: { sessionId: 'c', workspaceId: 'w' } }),
        session('alias', { cwd: '/private/repo/app', cwdAliases: ['/repo/app'] })
      ],
      '/repo/app'
    )
    expect(picked.map((entry) => entry.id)).toEqual(['alias'])
  })
})
