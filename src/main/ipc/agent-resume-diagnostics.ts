// 다시 열지 못한 Claude 대화를 이 맥 진단 기록에만 남긴다. 서버로 보내지 않는다.
// 진단 기록이 꺼져 있으면(ORCA_DIAGNOSTICS_DISABLED · CI) startSpan 이 아무것도 쓰지 않는다.

import { ipcMain } from 'electron'
import { startSpan } from '../observability/tracer'
import { parseAgentResumeDiagnostic } from '../../shared/agent-resume-diagnostics'

export const AGENT_RESUME_DIAGNOSTIC_SPAN = 'terminal.agent-resume'

export function recordAgentResumeDiagnostic(value: unknown): boolean {
  const diagnostic = parseAgentResumeDiagnostic(value)
  if (!diagnostic) {
    return false
  }
  const span = startSpan(AGENT_RESUME_DIAGNOSTIC_SPAN, {
    attributes: {
      stage: diagnostic.stage,
      agent: diagnostic.agent,
      elapsedMs: diagnostic.elapsedMs
    }
  })
  if (diagnostic.stage === 'auto-retry-recovered') {
    span.end()
  } else {
    span.fail(diagnostic.stage)
  }
  return true
}

export function registerAgentResumeDiagnosticsHandler(): void {
  ipcMain.handle('diagnostics:recordAgentResume', (_event, value: unknown): void => {
    recordAgentResumeDiagnostic(value)
  })
}
