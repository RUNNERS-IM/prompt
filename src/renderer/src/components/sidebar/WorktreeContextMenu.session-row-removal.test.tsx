/**
 * @vitest-environment happy-dom
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../../shared/worktree/types'
import WorktreeContextMenu from './WorktreeContextMenu'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const shortcutLabelMock = vi.hoisted(() => vi.fn(() => null))

vi.mock('@/hooks/useShortcutLabel', () => ({
  useOptionalShortcutLabel: shortcutLabelMock,
  formatShortcutLabel: () => '',
  formatOptionalShortcutLabel: () => null
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: function DropdownMenu(props: { children?: React.ReactNode; open?: boolean }) {
    return <div data-testid="dropdown-menu">{props.children}</div>
  },
  DropdownMenuContent: function DropdownMenuContent(props: { children?: React.ReactNode }) {
    return <div data-testid="dropdown-menu-content">{props.children}</div>
  },
  DropdownMenuItem: function DropdownMenuItem(props: {
    children?: React.ReactNode
    disabled?: boolean
    variant?: string
  }) {
    return (
      <div
        data-testid="dropdown-menu-item"
        data-variant={props.variant}
        data-disabled={props.disabled}
      >
        {props.children}
      </div>
    )
  },
  DropdownMenuSeparator: function DropdownMenuSeparator() {
    return <hr />
  },
  DropdownMenuShortcut: function DropdownMenuShortcut(props: { children?: React.ReactNode }) {
    return <span data-testid="dropdown-menu-shortcut">{props.children}</span>
  },
  DropdownMenuLabel: function DropdownMenuLabel(props: { children?: React.ReactNode }) {
    return <div>{props.children}</div>
  },
  DropdownMenuSub: function DropdownMenuSub(props: { children?: React.ReactNode }) {
    return <div>{props.children}</div>
  },
  DropdownMenuSubContent: function DropdownMenuSubContent(props: { children?: React.ReactNode }) {
    return <div>{props.children}</div>
  },
  DropdownMenuSubTrigger: function DropdownMenuSubTrigger(props: { children?: React.ReactNode }) {
    return <div>{props.children}</div>
  },
  DropdownMenuTrigger: function DropdownMenuTrigger(props: { children?: React.ReactNode }) {
    return <div>{props.children}</div>
  },
  DropdownMenuRadioGroup: function DropdownMenuRadioGroup(props: { children?: React.ReactNode }) {
    return <div>{props.children}</div>
  },
  DropdownMenuRadioItem: function DropdownMenuRadioItem(props: { children?: React.ReactNode }) {
    return <div>{props.children}</div>
  }
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

vi.mock('lucide-react', async () =>
  (await import('../tab-bar/lucide-icon-stub-fixture')).stubEveryIcon()
)

vi.mock('@/i18n/i18n', () => ({
  i18n: { language: 'en' },
  translate: (_key: string, fallback: string) => fallback
}))

const defaultStoreState = {
  unifiedTabsByWorktree: {},
  updateWorktreeMeta: vi.fn(),
  setWorktreesPinnedAndReveal: vi.fn(),
  workspaceStatuses: [],
  openModal: vi.fn(),
  projectGroups: [],
  createProjectGroup: vi.fn(),
  moveProjectToGroup: vi.fn(),
  deleteStateByWorktreeId: {},
  worktreeLineageById: {},
  workspaceLineageByChildKey: {},
  updateWorktreeLineage: vi.fn(),
  tabsByWorktree: {},
  ptyIdsByTabId: {},
  browserTabsByWorktree: {},
  worktreesByRepo: {},
  repos: []
}

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof defaultStoreState) => unknown) => selector(defaultStoreState),
    {
      getState: () => defaultStoreState
    }
  )
}))

vi.mock('@/store/selectors', () => {
  const emptyWorktrees: never[] = []
  const emptyMap = new Map()
  return {
    getAllWorktreesFromState: () => emptyWorktrees,
    useRepoById: (repoId?: string) =>
      repoId ? { id: repoId, name: repoId, displayName: repoId } : undefined,
    getRepoMapFromState: () => emptyMap,
    getWorktreeMapFromState: () => emptyMap
  }
})

vi.mock('./ProjectGroupNameDialog', () => ({
  ProjectGroupNameDialog: () => null
}))

vi.mock('./WorktreeParentPickerPopover', () => ({
  WorktreeParentPickerPopover: () => null
}))

vi.mock('./WorktreeDeveloperMenu', () => ({
  WorktreeDeveloperMenu: () => null
}))

vi.mock('./WorktreeOpenInMenu', () => ({
  WorktreeOpenInSubMenu: () => null
}))

vi.mock('./WorkspaceSleepMenuItems', () => ({
  WorkspaceSleepMenuItems: () => null
}))

const mounted: { container: HTMLDivElement; root: Root }[] = []

function renderContextMenu(worktree: Worktree) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <WorktreeContextMenu worktree={worktree}>
        <div data-testid="project-header">Project header</div>
        <div className="compact-agent-row" data-testid="session-row">
          <span data-testid="session-name">Old session</span>
        </div>
      </WorktreeContextMenu>
    )
  })
  mounted.push({ container, root })
  return container
}

const mainWorktree = {
  id: 'repo-1::main',
  repoId: 'repo-1',
  name: 'main',
  path: '/path/to/main',
  isMainWorktree: true
} as unknown as Worktree

function rightClick(container: HTMLElement, testId: string): void {
  const target = container.querySelector(`[data-testid="${testId}"]`) as HTMLElement
  act(() => {
    target.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })
    )
  })
}

function menuItemLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-testid="dropdown-menu-item"]')).map(
    (item) => item.textContent ?? ''
  )
}

describe('WorktreeContextMenu project removal from a session row', () => {
  afterEach(() => {
    for (const { root, container } of mounted) {
      act(() => {
        root.unmount()
      })
      container.remove()
    }
    mounted.length = 0
  })

  it('offers removing the project from the project header', () => {
    const container = renderContextMenu(mainWorktree)
    rightClick(container, 'project-header')

    expect(menuItemLabels(container)).toContain('Remove project from list…')
  })

  it('never offers removing the whole project from a session row', () => {
    const container = renderContextMenu(mainWorktree)
    rightClick(container, 'session-name')

    const labels = menuItemLabels(container)
    expect(labels).not.toContain('Remove project from list…')
    expect(labels).not.toContain('Delete Worktree')
  })

  it('offers it again when the next right-click is on the header', () => {
    const container = renderContextMenu(mainWorktree)
    rightClick(container, 'session-row')
    rightClick(container, 'project-header')

    expect(menuItemLabels(container)).toContain('Remove project from list…')
  })
})
