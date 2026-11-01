/**
 * @vitest-environment happy-dom
 */
import type { ReactNode } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({ openNewWindow: vi.fn() }))

vi.mock('../store', () => ({
  useAppStore: Object.assign((selector: (s: unknown) => unknown) => selector({}), {
    getState: () => ({})
  })
}))
vi.mock('@/store/slices/worktree-nav-history', () => ({
  canGoBackWorktreeHistory: () => false,
  canGoForwardWorktreeHistory: () => false
}))
vi.mock('../hooks/useShortcutLabel', () => ({
  useShortcutLabel: () => '⌘B',
  getShortcutPlatform: () => 'darwin'
}))
vi.mock('../lib/prompt-windows', () => ({ openPromptNewWindow: mocks.openNewWindow }))
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: ReactNode }) => <span data-tip="">{children}</span>
}))

import { TitlebarLeftControls } from './TitlebarLeftControls'
import type { AppChromeLayout } from './use-app-chrome-layout'

let root: Root | undefined

function render(showSidebar: boolean): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const layout = {
    titlebarLeftControlsRef: { current: null },
    leftTitlebarChromeLayout: { isFloating: false },
    isFullScreen: false,
    showSidebar,
    showTitlebarAppName: false,
    activeView: 'settings'
  } as unknown as AppChromeLayout
  root = createRoot(container)
  act(() => root?.render(<TitlebarLeftControls layout={layout} />))
  return container
}

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.innerHTML = ''
})

describe('TitlebarLeftControls new window button', () => {
  it('sits right after the sidebar toggle and opens a new window', () => {
    const container = render(true)
    const buttons = [...container.querySelectorAll('button')].map((b) =>
      b.getAttribute('aria-label')
    )
    expect(buttons.slice(-2)).toEqual(['Toggle sidebar', 'New Window'])
    const tips = [...container.querySelectorAll('[data-tip]')].map((t) => t.textContent)
    expect(tips).toContain('New Window ⌘N')
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="New Window"]')?.click())
    expect(mocks.openNewWindow).toHaveBeenCalledTimes(1)
  })

  it('is hidden where the sidebar toggle is hidden', () => {
    expect(render(false).querySelector('[aria-label="New Window"]')).toBeNull()
  })
})
