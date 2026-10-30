/** @vitest-environment happy-dom */
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  close: vi.fn(),
  rename: vi.fn(),
  color: vi.fn(),
  startClaude: vi.fn(),
  startTerminal: vi.fn(),
  openCopy: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign((selector: (s: unknown) => unknown) => selector(mocks.state), {
    getState: () => mocks.state
  })
}))
vi.mock('@/hooks/useShortcutLabel', () => ({
  useOptionalShortcutLabel: (id: string) =>
    ({
      'tab.close': '⌘W',
      'tab.newAgent': '⌥⌘T',
      'tab.newTerminal': '⌘T',
      'workspace.create': '⌘N'
    })[id] ?? null
}))
vi.mock('@/hooks/use-repo-ssh-gate', () => ({
  useRepoSshGate: () => ({ connectionId: null, status: null })
}))
vi.mock('@/components/prompt-claude-model-menu', () => ({
  PromptClaudeModelSubmenu: () => null
}))
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => children,
  TooltipContent: () => null
}))
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => children,
  DropdownMenuContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect,
    variant
  }: {
    children?: ReactNode
    disabled?: boolean
    onSelect?: () => void
    variant?: string
  }) => (
    <button
      type="button"
      data-menu-item=""
      data-variant={variant}
      disabled={disabled}
      onClick={() => onSelect?.()}
    >
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children?: ReactNode }) => children,
  DropdownMenuSubContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children?: ReactNode }) => (
    <span data-sub-trigger="">{children}</span>
  ),
  DropdownMenuShortcut: ({ children }: { children?: ReactNode }) => <kbd>{children}</kbd>,
  DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => children
}))
vi.mock('@/lib/prompt-windows', () => ({
  openPromptSessionCopyWindow: mocks.openCopy
}))
vi.mock('./prompt-sidebar-session-actions', () => ({
  closePromptSession: mocks.close,
  renamePromptSession: mocks.rename,
  setPromptSessionColor: mocks.color,
  startPromptClaudeSession: mocks.startClaude,
  startPromptTerminal: mocks.startTerminal,
  promptHeaderTargetWorktree: (list: { id: string; isMainWorktree?: boolean }[]) =>
    list.find((w) => w.isMainWorktree) ?? list[0]
}))

import { PromptSessionCloseButton, PromptSessionRowMenu } from './prompt-session-row-menu'
import { PromptNewSessionMenuButton, PromptRepoHeaderNewButton } from './prompt-sidebar-new-menu'
import type { Repo } from '../../../../shared/repo-types'

let root: Root | undefined

function render(node: ReactNode): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
  return container
}

function items(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-menu-item]')].map((el) => el.textContent ?? '')
}

function click(container: HTMLElement, text: string): void {
  const button = [...container.querySelectorAll<HTMLButtonElement>('[data-menu-item]')].find((el) =>
    el.textContent?.startsWith(text)
  )
  act(() => button!.click())
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state = {
    tabsByWorktree: { 'wt-1': [{ id: 'term-1', color: '#3b82f6' }] }
  }
})

afterEach(() => {
  act(() => root?.unmount())
  document.body.replaceChildren()
})

describe('PromptSessionRowMenu', () => {
  it('offers rename, tab color and a red close with ⌘W, as in the 2A drawing', () => {
    const container = render(
      <PromptSessionRowMenu tab={{ id: 'term-1', worktreeId: 'wt-1' }} name="[PROMPT] 개발">
        <div>row</div>
      </PromptSessionRowMenu>
    )
    const list = items(container)
    expect(list[0]).toBe('Rename…')
    expect(container.querySelector('[data-sub-trigger]')?.textContent).toBe('Tab Color')
    const close = [...container.querySelectorAll('[data-menu-item]')].at(-1)
    expect(close?.textContent).toBe('Close Session⌘W')
    expect(close?.getAttribute('data-variant')).toBe('destructive')
  })

  it('runs each item on this session', () => {
    const container = render(
      <PromptSessionRowMenu tab={{ id: 'term-1', worktreeId: 'wt-1' }} name="[PROMPT] 개발">
        <div>row</div>
      </PromptSessionRowMenu>
    )
    click(container, 'Rename')
    expect(mocks.rename).toHaveBeenCalledWith('wt-1', 'term-1')
    click(container, 'Green')
    expect(mocks.color).toHaveBeenCalledWith('term-1', '#22c55e')
    click(container, 'None')
    expect(mocks.color).toHaveBeenCalledWith('term-1', null)
    click(container, 'Close Session')
    expect(mocks.close).toHaveBeenCalledWith('wt-1', 'term-1')
  })

  it('offers a copy in a new window only when it has the copy command', () => {
    const command = 'claude --resume fb734d47-9c9f-462d-a948-faab45a52682 --fork-session'
    const container = render(
      <PromptSessionRowMenu
        tab={{ id: 'term-1', worktreeId: 'wt-1' }}
        name="[PROMPT] 개발"
        copyCommand={command}
      >
        <div>row</div>
      </PromptSessionRowMenu>
    )
    expect(items(container).at(-2)).toBe('Copy to New Window')
    click(container, 'Copy to New Window')
    expect(mocks.openCopy).toHaveBeenCalledWith('wt-1', command)
    act(() => root?.unmount())
    root = undefined
    const plain = render(
      <PromptSessionRowMenu tab={{ id: 'term-1', worktreeId: 'wt-1' }} name="[PROMPT] 개발">
        <div>row</div>
      </PromptSessionRowMenu>
    )
    expect(items(plain)).not.toContain('Copy to New Window')
  })

  it('puts the hover × over the time spot, labeled by the row name', () => {
    const container = render(
      <PromptSessionRowMenu tab={{ id: 'term-1', worktreeId: 'wt-1' }} name="[PROMPT] 개발">
        <div>row</div>
      </PromptSessionRowMenu>
    )
    const close = container.querySelector('[data-prompt-session-close]')
    expect(close?.getAttribute('aria-label')).toBe('Close [PROMPT] 개발')
    expect(close?.className).toContain('absolute')
  })

  it('owns its right-click so the workspace menu around it stays shut', () => {
    const outer = vi.fn()
    const container = render(
      <div onContextMenu={outer}>
        <PromptSessionRowMenu tab={{ id: 'term-1', worktreeId: 'wt-1' }} name="[PROMPT] 개발">
          <div data-row="">row</div>
        </PromptSessionRowMenu>
      </div>
    )
    const wrapper = container.querySelector('[data-prompt-session-menu="term-1"]')!
    expect(wrapper.getAttribute('data-worktree-context-menu-scope')).toBe('prompt-session')
    expect(wrapper.className).toContain('group/prompt-session-row')
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true
    })
    act(() => {
      container.querySelector('[data-row]')!.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
    expect(outer).not.toHaveBeenCalled()
  })
})

describe('PromptSessionCloseButton', () => {
  it('shows only on row hover and closes without opening the row', () => {
    const rowClick = vi.fn()
    const container = render(
      <div onClick={rowClick}>
        <PromptSessionCloseButton tab={{ id: 'term-1', worktreeId: 'wt-1' }} name="[PROMPT] 개발" />
      </div>
    )
    const button = container.querySelector<HTMLButtonElement>('[data-prompt-session-close]')!
    expect(button.className).toContain('hidden')
    expect(button.className).toContain('right-1')
    expect(button.className).toContain('group-hover/prompt-session-row:inline-flex')
    expect(button.getAttribute('aria-label')).toBe('Close [PROMPT] 개발')
    act(() => button.click())
    expect(mocks.close).toHaveBeenCalledWith('wt-1', 'term-1')
    expect(rowClick).not.toHaveBeenCalled()
  })
})

describe('PromptNewSessionMenuButton', () => {
  it('lists New Claude Session, New Terminal and New Workspace… with their shortcuts', () => {
    const onSelect = vi.fn()
    const container = render(
      <PromptNewSessionMenuButton worktreeId="wt-1" label="prompt" onNewWorkspace={onSelect} />
    )
    expect(items(container)).toEqual([
      'New Claude Session⌥⌘T',
      'New Terminal⌘T',
      'New Workspace…⌘N'
    ])
    click(container, 'New Claude Session')
    expect(mocks.startClaude).toHaveBeenCalledWith('wt-1')
    click(container, 'New Terminal')
    expect(mocks.startTerminal).toHaveBeenCalledWith('wt-1')
    click(container, 'New Workspace')
    expect(onSelect).toHaveBeenCalled()
  })

  it('leaves out New Workspace… on a workspace line', () => {
    const container = render(<PromptNewSessionMenuButton worktreeId="wt-1" label="feature" />)
    expect(items(container)).toEqual(['New Claude Session⌥⌘T', 'New Terminal⌘T'])
    expect(container.querySelector('[data-prompt-new-menu]')?.getAttribute('aria-label')).toBe(
      'New in feature'
    )
  })

  it('disables the session items when the project has no workspace', () => {
    const container = render(<PromptNewSessionMenuButton worktreeId={undefined} label="empty" />)
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('[data-menu-item]')]
    expect(buttons.every((b) => b.disabled)).toBe(true)
  })
})

describe('PromptRepoHeaderNewButton', () => {
  it('opens sessions in the main workspace and keeps workspace creation as the last item', () => {
    mocks.state = {
      worktreesByRepo: {
        'repo-1': [
          { id: 'wt-a', isMainWorktree: false },
          { id: 'wt-main', isMainWorktree: true }
        ]
      }
    }
    const onCreateForRepo = vi.fn()
    const repo = { id: 'repo-1', kind: 'folder' } as unknown as Repo
    const container = render(
      <PromptRepoHeaderNewButton
        repo={repo}
        label="prompt"
        pinHost
        onCreateForRepo={onCreateForRepo}
      />
    )
    click(container, 'New Claude Session')
    expect(mocks.startClaude).toHaveBeenCalledWith('wt-main')
    click(container, 'New Workspace')
    expect(onCreateForRepo).toHaveBeenCalledWith(repo, { pinHost: true })
  })
})
