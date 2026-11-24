import { describe, expect, it, vi } from 'vitest'
import { applyClaudeRunningSessions } from './claude-running-session-fill'

type Entry = { agentType: string; providerSession?: unknown; structuredHostOwned?: boolean }
const store = vi.hoisted(() => ({
  agentStatusByPaneKey: {} as Record<string, Entry>,
  changed: new Set<string>()
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      updateAgentStatusState: (
        update: (state: typeof store, changed: Set<string>) => Partial<typeof store>
      ) => Object.assign(store, update(store, store.changed))
    })
  }
}))
vi.mock('@/store/slices/agent-pane-authority', () => ({
  resolveAgentPaneAuthorityKey: (key: string) => key
}))

const evidence = (paneKey: string) => ({
  paneKey,
  pid: 1,
  configDir: '/p/claude-profiles/x/home',
  sessionId: `s-${paneKey}`,
  cwd: '/repo',
  transcriptPath: `/p/claude-profiles/x/home/projects/-repo/s-${paneKey}.jsonl`
})

describe('applyClaudeRunningSessions', () => {
  it('fills only live Claude panes that have no hook transcript', () => {
    const hooked = { key: 'session_id', id: 'h', transcriptPath: '/h/projects/-r/h.jsonl' }
    store.agentStatusByPaneKey = {
      bare: { agentType: 'claude' },
      hooked: { agentType: 'claude', providerSession: hooked },
      codex: { agentType: 'codex' },
      remote: { agentType: 'claude', structuredHostOwned: true }
    }
    const filled = applyClaudeRunningSessions(
      ['bare', 'hooked', 'codex', 'remote', 'gone'].map(evidence)
    )
    expect(filled).toBe(1)
    expect(store.agentStatusByPaneKey.bare.providerSession).toEqual({
      key: 'session_id',
      id: 's-bare',
      cwd: '/repo',
      transcriptPath: '/p/claude-profiles/x/home/projects/-repo/s-bare.jsonl'
    })
    expect(store.agentStatusByPaneKey.hooked.providerSession).toBe(hooked)
    expect([...store.changed]).toEqual(['bare'])
  })
})
