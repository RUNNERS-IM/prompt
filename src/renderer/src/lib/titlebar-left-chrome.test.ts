import { describe, expect, it } from 'vitest'
import { resolveLeftTitlebarChromeLayout } from './titlebar-left-chrome'

const base = {
  workspaceChromeActive: true,
  stackedSidebarOpen: false,
  creationLayoutActive: false,
  sidebarOpen: true
}

describe('resolveLeftTitlebarChromeLayout', () => {
  it('docks the header in the open sidebar column', () => {
    expect(resolveLeftTitlebarChromeLayout(base)).toEqual({ shouldMount: true, isFloating: false })
  })

  it('floats the header when the sidebar is closed', () => {
    expect(resolveLeftTitlebarChromeLayout({ ...base, sidebarOpen: false }).isFloating).toBe(true)
  })

  // 아랍어는 사이드바가 오른쪽으로 가도 맥 신호등은 창 왼쪽에 남아, 머리는 늘 왼쪽 위에 뜬다.
  it('always floats the header at the window left when the workspace is mirrored', () => {
    expect(resolveLeftTitlebarChromeLayout({ ...base, workspaceMirrored: true })).toEqual({
      shouldMount: true,
      isFloating: true
    })
    expect(
      resolveLeftTitlebarChromeLayout({
        ...base,
        stackedSidebarOpen: true,
        workspaceMirrored: true
      }).isFloating
    ).toBe(true)
  })

  it('mounts nothing outside the workspace chrome', () => {
    expect(
      resolveLeftTitlebarChromeLayout({
        ...base,
        workspaceChromeActive: false,
        workspaceMirrored: true
      })
    ).toEqual({ shouldMount: false, isFloating: false })
  })
})
