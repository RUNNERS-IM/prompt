import { afterEach, describe, expect, it } from 'vitest'
import {
  rememberClaudeRunningSessions,
  refreshClaudeRunningSessions,
  resetClaudeRunningSessionCacheForTests,
  runningClaudeSessionIdForPane
} from './claude-running-session-cache'

const evidence = {
  paneKey: 'tab-1:11111111-1111-4111-8111-111111111111',
  pid: 42,
  configDir: '/profiles/a/home',
  sessionId: 'session-a',
  cwd: '/work',
  transcriptPath: '/profiles/a/home/projects/-work/session-a.jsonl'
}

describe('claude running session cache', () => {
  afterEach(() => resetClaudeRunningSessionCacheForTests())

  it('answers a pane from the last probe', () => {
    rememberClaudeRunningSessions([evidence])
    expect(runningClaudeSessionIdForPane(evidence.paneKey)).toBe('session-a')
    expect(runningClaudeSessionIdForPane('tab-2:x')).toBeUndefined()
  })

  it('does not probe again while the last probe is fresh', async () => {
    rememberClaudeRunningSessions([evidence])
    let asked = 0
    await refreshClaudeRunningSessions(async () => {
      asked += 1
      return []
    })
    expect(asked).toBe(0)
    expect(runningClaudeSessionIdForPane(evidence.paneKey)).toBe('session-a')
  })

  it('keeps listing working when the folders cannot be read', async () => {
    await refreshClaudeRunningSessions(async () => {
      throw new Error('no folders')
    })
    expect(runningClaudeSessionIdForPane(evidence.paneKey)).toBeUndefined()
  })
})
