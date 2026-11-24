// 시험 촬영 모드(RUNNERS_TEST_SHOTS)에서 계정 고르기 메뉴 · 설정의 계정 칸을 찍으려고 넣는 가짜 Claude 계정 둘.
// 계정 폴더에는 이메일만 적힌 .claude.json 하나를 둔다. 토큰 · 키는 없어 실제 Claude 로그인으로 쓰이지 않는다.
// 이 폴더가 있어야 메뉴가 「로그인 필요」 대신 로그인된 계정처럼 그린다. 끝나면 원래 계정 목록으로 되돌리고
// 여기서 만든 폴더만 지운다. 시험 촬영은 시험용 사용자 자료 폴더로 돌리지만, 이미 있는 폴더는 건드리지 않는다.
import { app } from 'electron'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ClaudeManagedAccount } from '../../shared/managed-account-types'
import { mainProcessState as state } from './main-process-state'

const FAKE_ACCOUNTS = [
  { id: '0195f2ce-7e57-4000-8000-0000000000a1', email: 'work@example.com' },
  { id: '0195f2ce-7e57-4000-8000-0000000000a2', email: 'personal@example.com' }
]

/** 가짜 계정을 넣고, 되돌리는 함수를 돌려준다. 설정 저장소가 없으면 아무것도 안 한다. */
export function addPromptTestShotAccounts(): () => void {
  const store = state.store
  if (!store) {
    return () => {}
  }
  const before = store.getSettings()
  const saved = {
    claudeManagedAccounts: before.claudeManagedAccounts,
    activeClaudeManagedAccountId: before.activeClaudeManagedAccountId
  }
  const made: string[] = []
  const now = Date.now()
  const accounts: ClaudeManagedAccount[] = FAKE_ACCOUNTS.map((fake, index) => {
    const profile = join(app.getPath('userData'), 'claude-profiles', fake.id)
    const home = join(profile, 'home')
    if (!existsSync(profile)) {
      mkdirSync(home, { recursive: true })
      writeFileSync(
        join(home, '.claude.json'),
        JSON.stringify({ oauthAccount: { emailAddress: fake.email } })
      )
      made.push(profile)
    }
    return {
      id: fake.id,
      email: fake.email,
      managedAuthPath: home,
      authMethod: 'unknown',
      createdAt: now - index,
      updatedAt: now - index,
      lastAuthenticatedAt: now - index
    }
  })
  store.updateSettings(
    { claudeManagedAccounts: [...before.claudeManagedAccounts, ...accounts] },
    { notifyListeners: true }
  )
  return () => {
    store.updateSettings(saved, { notifyListeners: true })
    for (const profile of made) {
      rmSync(profile, { recursive: true, force: true })
    }
  }
}
