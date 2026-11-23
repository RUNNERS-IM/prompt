import { describe, expect, it } from 'vitest'
import { isUpdateCardVisible } from './update-card-visibility'

const base = { dismissedVersion: null, cachedVersion: '1.0.61', updateUserInitiatedCycle: false }

// 저절로 받아 쉬는 중에 까는 판은 카드를 띄우지 않고, 메뉴에서 찾은 판은 지금처럼 카드로 묻는다.
describe('update card visibility for auto install', () => {
  it('hides every step of an automatic install', () => {
    for (const status of [
      { state: 'available', version: '1.0.61', changelog: null, autoInstall: true },
      { state: 'downloading', version: '1.0.61', percent: 40, autoInstall: true },
      { state: 'downloaded', version: '1.0.61', autoInstall: true }
    ] as const) {
      expect(isUpdateCardVisible({ ...base, status })).toBe(false)
    }
  })

  it('still shows the card for an update the person has to choose', () => {
    expect(
      isUpdateCardVisible({
        ...base,
        status: { state: 'available', version: '1.0.61', changelog: null }
      })
    ).toBe(true)
  })
})
