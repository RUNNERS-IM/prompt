import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { showClaudeAccountSwitchPromptForTestShots } from './claude-account-switch-sessions'
import {
  announceRestart,
  resetClaudeAccountRestartToastForTests
} from './claude-account-restart-toast'
import { cantMoveReasonLabel } from './claude-switch-session-labels'
import type { ClaudeSessionMoveCandidate } from './claude-session-account-move'

// 시험 촬영 모드(RUNNERS_TEST_SHOTS)가 계정 바꾸기 창 · 다시 켜기 알림을 찍으려고 여는 장면.
// 실제로 도는 Claude 세션이 없어도 보이게 지어낸 세션을 넣는다. 세션 칸은 지어낸 id 라 이름이
// 「Claude 세션」 기본 글로 나오고, 작업 공간 이름은 id 가 그대로 보인다. 로그인 · 토큰은 쓰지 않는다.
// main 의 촬영 코드만 executeJavaScript 로 부른다. 부르지 않으면 아무 일도 하지 않는다.

const PREVIOUS = 'work@example.com'
const NEXT = 'personal@example.com'

function session(worktreeId: string, n: number): ClaudeSessionMoveCandidate {
  return {
    ptyId: `test-shot-pty-${n}`,
    worktreeId,
    tabId: `test-shot-tab-${n}`,
    leafId: `0195f2ce-0000-4000-8000-00000000000${n}`
  }
}

const scenes = {
  /** 바꾼 계정에 아직 남은 세션을 다시 켤지 묻는 창(세션 목록 포함). */
  accountSwitch(): void {
    showClaudeAccountSwitchPromptForTestShots({
      previousAccountLabel: PREVIOUS,
      nextAccountLabel: NEXT,
      sessions: {
        onAccount: [session('sample-web', 1), session('sample-web', 2), session('api-server', 3)],
        elsewhere: [{ ...session('api-server', 4), accountLabel: 'team@example.com' }],
        cantMove: [{ ...session('docs', 5), reason: 'own-folder' }]
      }
    })
  },
  /** 다시 켜는 중 알림(옮기지 못한 세션 줄 포함). */
  restartToast(): void {
    const name = translate('accounts.claude.switchSessions.session', 'Claude session')
    announceRestart(
      [session('sample-web', 1), session('sample-web', 2)],
      NEXT,
      2,
      () => {},
      {
        lines: [
          `${name} (${cantMoveReasonLabel('own-folder')})`,
          `${name} (${cantMoveReasonLabel('unknown-account')})`
        ]
      }
    )
  },
  clear(): void {
    showClaudeAccountSwitchPromptForTestShots(null)
    // 지어낸 세션의 결과를 기다리는 감시를 멈춘다. 그대로 두면 나중 사진에 결과 알림이 뜬다.
    resetClaudeAccountRestartToastForTests()
    toast.dismiss()
  }
}

export function installPromptTestShotScenes(): void {
  ;(window as unknown as { __promptTestShotScenes?: typeof scenes }).__promptTestShotScenes = scenes
}
