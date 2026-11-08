// 메뉴 막대 아이콘을 누르면 열리는 패널(맥 전용)과 기본 메뉴(윈도우)가 함께 쓰는 줄 목록.
// 줄 목록은 main 이 번역까지 마친 글로 만들고, 패널 화면은 받은 그대로 그리기만 한다. 그래서 두 메뉴의 글과 순서가 늘 같다.
// 결정: runners-wiki 앱-배포 「2026-11-05 네 앱 메뉴 패널 통일」 2A, 「2026-11-08 Prompt 패널은 열기 · 새 창」,
// 「2026-11-07 Prompt 왼쪽 아래 물음표 · 과녁 빼고 맥 메뉴로」(Prompt 재시작 줄).

export const PROMPT_MENU_PANEL_ROWS_CHANNEL = 'promptMenuPanel:rows'
export const PROMPT_MENU_PANEL_RUN_CHANNEL = 'promptMenuPanel:run'
export const PROMPT_MENU_PANEL_FIT_HEIGHT_CHANNEL = 'promptMenuPanel:fitHeight'
/** 패널을 열 때마다 main 이 새 줄 목록을 실어 보낸다(다른 창에서 바꾼 설정도 맞게 보이도록). */
export const PROMPT_MENU_PANEL_SHOWN_CHANNEL = 'promptMenuPanel:shown'

/** 줄 아이콘 이름(lucide). */
export type PromptMenuIconName =
  | 'app-window'
  | 'plus'
  | 'settings'
  | 'circle-help'
  | 'rotate-cw'
  | 'square-x'
  | 'circle-x'

export type PromptMenuCommandId =
  | 'open'
  | 'newWindow'
  | 'settings'
  | 'help'
  | 'restart'
  | 'quit'
  | 'quitCompletely'

export const PROMPT_MENU_COMMAND_IDS: readonly PromptMenuCommandId[] = [
  'open',
  'newWindow',
  'settings',
  'help',
  'restart',
  'quit',
  'quitCompletely'
]

export function isPromptMenuCommandId(value: unknown): value is PromptMenuCommandId {
  return typeof value === 'string' && (PROMPT_MENU_COMMAND_IDS as readonly string[]).includes(value)
}

/** 오른쪽에 회색으로 보이는 단축키 안내. 진짜 단축키는 앱 메뉴가 가진다. */
export type PromptMenuAccelerator = 'CmdOrCtrl+N' | 'CmdOrCtrl+Q'

export type PromptMenuRow =
  | { kind: 'separator' }
  /** 패널 맨 위 줄: 굵은 앱 이름과 그 옆 회색 글(실행 중 터미널 수). 패널에만 있다. */
  | { kind: 'head'; name: string; sub?: string; dir?: 'rtl' }
  /** 누를 수 없는 회색 줄. dot 이 있으면 앞에 초록 점(실행 중 터미널 수), 없으면 개발판 이름표. */
  | { kind: 'info'; label: string; dot?: 'green' }
  | {
      kind: 'command'
      id: PromptMenuCommandId
      icon: PromptMenuIconName
      label: string
      accelerator?: PromptMenuAccelerator
      toolTip?: string
    }

export type PromptMenuPanelApi = {
  /** 지금 상태로 새로 만든 줄 목록. */
  rows: () => Promise<PromptMenuRow[]>
  /** 줄을 누름. 패널을 닫고 그 명령을 실행한다. */
  run: (id: PromptMenuCommandId) => Promise<void>
  /** 창 높이를 내용 높이에 맞춘다. */
  fitHeight: (height: number) => void
  /** 패널이 열릴 때마다 새 줄 목록을 받는다. 구독을 푸는 함수를 돌려준다. */
  onShown: (listener: (rows: PromptMenuRow[]) => void) => () => void
}

/** 맥 단축키 안내 글. */
export function promptMenuAcceleratorText(accelerator: PromptMenuAccelerator): string {
  return accelerator === 'CmdOrCtrl+N' ? '⌘N' : '⌘Q'
}
