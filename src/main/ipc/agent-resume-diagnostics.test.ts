import { beforeEach, describe, expect, it, vi } from 'vitest'

const { startSpan, span } = vi.hoisted(() => {
  const span = { end: vi.fn(), fail: vi.fn() }
  return { span, startSpan: vi.fn(() => span) }
})

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('../observability/tracer', () => ({ startSpan }))

import {
  AGENT_RESUME_DIAGNOSTIC_SPAN,
  recordAgentResumeDiagnostic
} from './agent-resume-diagnostics'
import { parseAgentResumeDiagnostic } from '../../shared/agent-resume-diagnostics'

describe('parseAgentResumeDiagnostic', () => {
  it('keeps only the stage, agent and a clamped duration', () => {
    expect(
      parseAgentResumeDiagnostic({
        stage: 'resume-failed',
        agent: 'claude',
        elapsedMs: 45_000.6,
        sessionId: 'secret',
        cwd: '/Users/me'
      })
    ).toEqual({ stage: 'resume-failed', agent: 'claude', elapsedMs: 45_001 })
    expect(
      parseAgentResumeDiagnostic({
        stage: 'resume-failed',
        agent: 'claude',
        elapsedMs: 1e12
      })?.elapsedMs
    ).toBe(600_000)
  })

  it('rejects unknown shapes', () => {
    expect(parseAgentResumeDiagnostic(null)).toBeNull()
    expect(
      parseAgentResumeDiagnostic({
        stage: 'other',
        agent: 'claude',
        elapsedMs: 1
      })
    ).toBeNull()
    expect(
      parseAgentResumeDiagnostic({
        stage: 'resume-failed',
        agent: 'codex',
        elapsedMs: 1
      })
    ).toBeNull()
    expect(
      parseAgentResumeDiagnostic({
        stage: 'resume-failed',
        agent: 'claude',
        elapsedMs: Number.NaN
      })
    ).toBeNull()
  })
})

describe('recordAgentResumeDiagnostic', () => {
  beforeEach(() => {
    startSpan.mockClear()
    span.end.mockClear()
    span.fail.mockClear()
  })

  it('writes a failed span for a failure stage', () => {
    expect(
      recordAgentResumeDiagnostic({
        stage: 'auto-retry-failed',
        agent: 'claude',
        elapsedMs: 45_000
      })
    ).toBe(true)
    expect(startSpan).toHaveBeenCalledWith(AGENT_RESUME_DIAGNOSTIC_SPAN, {
      attributes: {
        stage: 'auto-retry-failed',
        agent: 'claude',
        elapsedMs: 45_000
      }
    })
    expect(span.fail).toHaveBeenCalledWith('auto-retry-failed')
  })

  it('ends the span normally when the automatic reopen recovered', () => {
    recordAgentResumeDiagnostic({
      stage: 'auto-retry-recovered',
      agent: 'claude',
      elapsedMs: 5000
    })
    expect(span.end).toHaveBeenCalledOnce()
    expect(span.fail).not.toHaveBeenCalled()
  })

  it('ignores a malformed value', () => {
    expect(recordAgentResumeDiagnostic({ stage: 'x' })).toBe(false)
    expect(startSpan).not.toHaveBeenCalled()
  })
})
