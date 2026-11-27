import { beforeEach, describe, expect, it, vi } from 'vitest'

const { state } = vi.hoisted(() => ({
  state: { agentStatusByPaneKey: {} as Record<string, unknown> }
}))

vi.mock('@/store', () => ({ useAppStore: { getState: () => state } }))

import { buildBareShellClaudeResume } from './cold-restore-resume-startup'
import type { ConnectPanePtySession } from './connect-pane-pty-session'

const providerSession = { key: 'session_id', id: 'claude-session-1' }

function statusEntry(agentState: 'done' | 'working', agentType = 'claude') {
  return {
    state: agentState,
    agentType,
    providerSession,
    updatedAt: 1,
    stateStartedAt: 1
  }
}

function makeSession(sleepingRecord: unknown = null) {
  const built = {
    agent: 'claude',
    command: 'claude --resume claude-session-1',
    resumeProviderSession: providerSession
  }
  const build = vi.fn((options?: { includeDone?: boolean }) =>
    options?.includeDone ? built : null
  )
  const session = {
    cacheKey: 'tab:leaf',
    getSleepingRecordForPane: () => sleepingRecord,
    buildColdRestoreAgentResumeStartup: build
  } as unknown as ConnectPanePtySession
  return { session, build, built }
}

describe('buildBareShellClaudeResume', () => {
  beforeEach(() => {
    state.agentStatusByPaneKey = {}
  })

  it('returns the resume for a Claude tab skipped only because it was waiting for input', () => {
    state.agentStatusByPaneKey = { 'tab:leaf': statusEntry('done') }
    const { session, build, built } = makeSession()
    expect(buildBareShellClaudeResume(session)).toBe(built)
    expect(build).toHaveBeenCalledWith({ includeDone: true })
  })

  it('leaves a tab without a status row alone, since /exit removes it', () => {
    const { session, build } = makeSession()
    expect(buildBareShellClaudeResume(session)).toBeNull()
    expect(build).not.toHaveBeenCalled()
  })

  it('leaves a tab that restore would already resume (and then chose not to) alone', () => {
    state.agentStatusByPaneKey = { 'tab:leaf': statusEntry('working') }
    const { session, build } = makeSession()
    expect(buildBareShellClaudeResume(session)).toBeNull()
    expect(build).not.toHaveBeenCalled()
  })

  it('leaves non-Claude agents alone', () => {
    state.agentStatusByPaneKey = { 'tab:leaf': statusEntry('done', 'codex') }
    const { session, built } = makeSession()
    Object.assign(built, { agent: 'codex' })
    expect(buildBareShellClaudeResume(session)).toBeNull()
  })
})
