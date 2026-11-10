import type { GlobalSettings } from './global-settings-types'

// 「업데이트 자동 확인」(메뉴 막대 메뉴의 켬/끔 줄). 기본은 켬: 값이 없거나 true 이면 켜짐이다.
// 끄면 시작할 때 · 하루마다 · 깨어날 때 · 창에 포커스가 올 때 하던 자동 확인만 건너뛴다.
// 「업데이트 확인…」을 직접 누르는 것은 늘 된다.
export function isAutomaticUpdateCheckOn(
  settings: Pick<GlobalSettings, 'autoCheckUpdates'> | null | undefined
): boolean {
  return settings?.autoCheckUpdates !== false
}
