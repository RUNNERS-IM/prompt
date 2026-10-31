/**
 * @vitest-environment happy-dom
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../../shared/worktree/types'
import { TooltipProvider } from '@/components/ui/tooltip'
import WorktreeContextMenu from './WorktreeContextMenu'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const WT = 'repo::wt-1'
const LEAF = '11111111-1111-4111-8111-111111111111'
const SESSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const state: Record<string, unknown> = {}

function resetState(agentStatusByPaneKey: Record<string, unknown>): void {
  for (const key of Object.keys(state)) {
    delete state[key]
  }
  Object.assign(state, {
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
    tabsByWorktree: { [WT]: [{ id: 'tab-1', worktreeId: WT, title: 'Terminal' }] },
    ptyIdsByTabId: {},
    browserTabsByWorktree: {},
    activeWorktreeId: null,
    activeTabId: null,
    activeTabIdByWorktree: { [WT]: 'tab-1' },
    terminalLayoutsByTabId: {},
    agentStatusByPaneKey,
    keybindings: {},
    settings: { activeRuntimeEnvironmentId: null, openInApplications: [] },
    openSettingsPage: vi.fn(),
    openSettingsTarget: vi.fn()
  })
}

vi.mock('@/store', () => ({
  useAppStore: Object.assign((selector: (s: typeof state) => unknown) => selector(state), {
    getState: () => state
  })
}))

vi.mock('@/store/selectors', () => {
  const emptyWorktrees: never[] = []
  const emptyMap = new Map()
  return {
    getAllWorktreesFromState: () => emptyWorktrees,
    useRepoById: (repoId?: string) =>
      repoId ? { id: repoId, name: repoId, displayName: repoId, projectGroupId: null } : undefined,
    getRepoMapFromState: () => emptyMap,
    getWorktreeMapFromState: () => emptyMap
  }
})

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback,
  i18n: { language: 'en', on: () => {}, off: () => {} }
}))

vi.mock('./ProjectGroupNameDialog', () => ({ ProjectGroupNameDialog: () => null }))
vi.mock('./WorktreeParentPickerPopover', () => ({ WorktreeParentPickerPopover: () => null }))
vi.mock('./WorktreeOpenInMenu', () => ({
  WorktreeOpenInSubMenu: () => <div role="menuitem">Open In</div>
}))

const openSessionCopy = vi.fn()
const mounted: { container: HTMLDivElement; root: Root }[] = []

beforeEach(() => {
  openSessionCopy.mockReset()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ui: { writeClipboardText: vi.fn() }, promptWindows: { openSessionCopy } }
  })
})

afterEach(() => {
  for (const { root, container } of mounted) {
    act(() => root.unmount())
    container.remove()
  }
  mounted.length = 0
})

function worktreeFixture(overrides: Partial<Worktree> = {}): Worktree {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the menu reads only the fields set here.
  return {
    id: WT,
    repoId: 'repo',
    displayName: 'Fix authentication race',
    branch: 'refs/heads/feature/auth-race',
    path: '/path/to/wt-1',
    isMainWorktree: false,
    ...overrides
  } as Worktree
}

function openMenu(worktree: Worktree): void {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mounted.push({ container, root })
  act(() => {
    root.render(
      <TooltipProvider>
        <WorktreeContextMenu worktree={worktree}>
          <div>Card</div>
        </WorktreeContextMenu>
      </TooltipProvider>
    )
  })
  const scope = container.querySelector('[data-worktree-context-menu-scope]')
  act(() => {
    scope?.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })
    )
  })
}

function menuItems(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
}

function duplicateItem(): HTMLElement | undefined {
  return menuItems().find((element) => element.textContent === 'Duplicate')
}

const claudeStatus = {
  [`tab-1:${LEAF}`]: {
    paneKey: `tab-1:${LEAF}`,
    agentType: 'claude',
    providerSession: { key: 'session_id', id: SESSION }
  }
}

describe('WorktreeContextMenu Duplicate', () => {
  it('sits right above Open In', () => {
    resetState(claudeStatus)
    openMenu(worktreeFixture())

    const labels = menuItems().map((element) => element.textContent)
    expect(labels.indexOf('Duplicate')).toBeGreaterThanOrEqual(0)
    expect(labels.indexOf('Open In')).toBe(labels.indexOf('Duplicate') + 1)
  })

  it("opens a fork of the active tab's Claude session in a new window", () => {
    resetState(claudeStatus)
    openMenu(worktreeFixture())

    const item = duplicateItem()
    expect(item?.getAttribute('data-disabled')).toBeNull()
    act(() => {
      item?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
      item?.click()
    })

    expect(openSessionCopy).toHaveBeenCalledExactlyOnceWith(
      WT,
      `claude --resume ${SESSION} --fork-session`
    )
  })

  it('is disabled when the tab has no Claude session id', () => {
    resetState({})
    openMenu(worktreeFixture())

    const item = duplicateItem()
    expect(item).toBeTruthy()
    expect(item?.getAttribute('data-disabled')).not.toBeNull()
    act(() => {
      item?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
      item?.click()
    })
    expect(openSessionCopy).not.toHaveBeenCalled()
  })
})
