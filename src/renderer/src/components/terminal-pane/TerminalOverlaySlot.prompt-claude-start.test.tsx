/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mounted = vi.hoisted(() => ({ panes: [] as string[], boxes: [] as string[] }))
const pending = vi.hoisted(() => ({ ids: new Set<string>() }))

vi.mock('./TerminalPane', () => ({
  default: (props: { tabId: string }) => {
    mounted.panes.push(props.tabId)
    return null
  }
}))
vi.mock('../prompt-claude-start/PromptClaudeStartBox', () => ({
  PromptClaudeStartBox: (props: { tabId: string; worktreePath: string; isActive: boolean }) => {
    mounted.boxes.push(`${props.tabId}:${props.worktreePath}:${props.isActive}`)
    return null
  }
}))
vi.mock('../prompt-claude-start/prompt-claude-start-tabs', () => ({
  usePromptClaudeStartTab: (tabId: string) => pending.ids.has(tabId)
}))
vi.mock('../../store', () => ({
  useAppStore: Object.assign(() => undefined, {
    getState: () => ({ pendingStartupByTabId: {} })
  })
}))

import { TerminalOverlaySlot } from './TerminalOverlaySlot'

let root: Root
let container: HTMLDivElement

function renderSlot(tabId: string, isVisible = true): void {
  root = createRoot(container)
  act(() => {
    root.render(
      <TerminalOverlaySlot
        terminalTabId={tabId}
        terminalGeneration={0}
        worktreeId="wt-1"
        worktreePath="/repo/app"
        startupCwd={undefined}
        groupId="group-1"
        isWorktreeActive
        isVisible={isVisible}
        isActive
        activityTerminalPortal={null}
        onFocusOwningGroup={vi.fn()}
        consumeSuppressedPtyExit={() => false}
        captureEmptiedReaction={() => () => undefined}
      />
    )
  })
}

describe('a new Claude tab waiting on its start box', () => {
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    mounted.panes = []
    mounted.boxes = []
    pending.ids = new Set(['box-tab'])
  })
  afterEach(() => {
    act(() => root?.unmount())
    container.remove()
  })

  it('shows the box and mounts no terminal, so nothing spawns', () => {
    renderSlot('box-tab')
    expect(mounted.boxes).toEqual(['box-tab:/repo/app:true'])
    expect(mounted.panes).toEqual([])
  })

  it('keeps the box unfocused while its tab is hidden', () => {
    renderSlot('box-tab', false)
    expect(mounted.boxes).toEqual(['box-tab:/repo/app:false'])
  })

  it('leaves every other terminal tab as it was', () => {
    renderSlot('plain-tab')
    expect(mounted.panes).toEqual(['plain-tab'])
    expect(mounted.boxes).toEqual([])
  })
})
