// 한도 문장: 구독 주간 · 5시간 한도(「You've hit your weekly limit · resets …」), 사용 크레딧 소진, 「stopped for limit」 류.
const USAGE_LIMIT_TEXT =
  /you'?ve (hit|reached) your\b[^\n]*\blimit|\busage limit\b|\bout of usage\b|\blimit reached\b|\bstopp?(ed)? (at|for) (the |your )?(usage )?limit\b/i

// 한도에 닿으면 Claude 가 띄우는 고르기 창(「What do you want to do?」)의 선택지. 이 창에 멈춘 세션은 훅을 더 보내지 않는다.
const LIMIT_PICKER_OPTION =
  /Stop and wait for (the )?limit to reset|Wait here, then continue|Switch to usage credits/i

// 고르기 창과 마지막 알림은 화면 맨 아래에 그려진다. 그 위 줄은 지난 기록이다.
const BOTTOM_REGION_LINES = 14

export function isClaudeUsageLimitText(text: string): boolean {
  return USAGE_LIMIT_TEXT.test(text)
}

/** 화면 아래쪽으로 본 한도 멈춤: 'picker' 는 고르기 창에서 답을 기다리는 중, 'stopped' 는 한도 문장으로 끝난 상태. */
export function claudeUsageLimitScreen(lines: readonly string[]): 'picker' | 'stopped' | null {
  const region = lines.filter((line) => line.trim() !== '').slice(-BOTTOM_REGION_LINES)
  if (region.some((line) => LIMIT_PICKER_OPTION.test(line))) {
    return 'picker'
  }
  return region.some((line) => USAGE_LIMIT_TEXT.test(line)) ? 'stopped' : null
}
