// 재부팅 · 다시 붙기 뒤 Claude 대화를 다시 열지 못한 일을 이 맥 진단 기록(logs/main.trace.ndjson)에 남길 때 쓰는 모양.
// 대화 id · 폴더 경로 · 명령은 싣지 않는다. 어느 단계에서 얼마 만에 어떻게 끝났는지만 남긴다.

export const AGENT_RESUME_DIAGNOSTIC_STAGES = [
  // 맨 셸로 복원된 대화 탭이 45초 뒤에도 셸이라 한 번 저절로 다시 열었다.
  'bare-shell-auto-retry',
  // 저절로 다시 연 대화가 떴다.
  'auto-retry-recovered',
  // 저절로 다시 연 대화도 뜨지 않아 「다시 시도」 줄을 띄웠다.
  'auto-retry-failed',
  // 그 밖의 다시 열기가 셸로 돌아왔다.
  'resume-failed'
] as const

export type AgentResumeDiagnosticStage = (typeof AGENT_RESUME_DIAGNOSTIC_STAGES)[number]

export type AgentResumeDiagnostic = {
  stage: AgentResumeDiagnosticStage
  agent: 'claude'
  /** 감시를 시작한 뒤 결과가 날 때까지 걸린 시간. */
  elapsedMs: number
}

const MAX_ELAPSED_MS = 10 * 60 * 1000

/** 화면 쪽에서 온 값을 그대로 믿지 않고, 모양이 맞을 때만 기록할 값으로 바꾼다. */
export function parseAgentResumeDiagnostic(value: unknown): AgentResumeDiagnostic | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const { stage, agent, elapsedMs } = value as Record<string, unknown>
  if (
    typeof stage !== 'string' ||
    !(AGENT_RESUME_DIAGNOSTIC_STAGES as readonly string[]).includes(stage) ||
    agent !== 'claude' ||
    typeof elapsedMs !== 'number' ||
    !Number.isFinite(elapsedMs)
  ) {
    return null
  }
  return {
    stage: stage as AgentResumeDiagnosticStage,
    agent,
    elapsedMs: Math.max(0, Math.min(MAX_ELAPSED_MS, Math.round(elapsedMs)))
  }
}
