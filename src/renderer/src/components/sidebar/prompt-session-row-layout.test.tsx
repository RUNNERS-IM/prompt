/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CompactAgentRow } from './worktree-card-compact-agent-row'
import { withPromptSessionRowMenu } from './prompt-session-row-menu'
import { promptSessionStatusLine } from './prompt-session-status-line'
import {
  PromptSessionStateIcon,
  promptSessionIconKind,
  resetPromptSessionIconMemoryForTest
} from './PromptSessionStateIcon'
import type { AgentDotState } from '@/components/AgentStateDot'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/components/dashboard/use-agent-row-conversation-name', () => ({
  useAgentRowConversationName: () => null
}))

vi.mock('./CacheTimer', () => ({
  default: () => null,
  usePromptCacheCountdownForPane: () => null
}))

function makeAgent(fields: {
  state?: string
  agentType?: string
  rowSource?: string
  prompt?: string
  toolName?: string
  toolInput?: string
  workingMode?: string
  lastAssistantMessage?: string
  tab?: Record<string, unknown>
}): DashboardAgentRowData {
  const state = fields.state ?? 'working'
  return {
    paneKey: 'tab-1:leaf-1',
    tab: fields.tab ?? {
      id: 'tab-1',
      title: '✳ Claude Code',
      customTitle: '[PROMPT] 개선'
    },
    agentType: fields.agentType ?? 'claude',
    rowSource: fields.rowSource,
    state,
    startedAt: 500,
    entry: {
      prompt: fields.prompt ?? 'do the task',
      state,
      stateStartedAt: 1000,
      toolName: fields.toolName,
      toolInput: fields.toolInput,
      workingMode: fields.workingMode,
      lastAssistantMessage: fields.lastAssistantMessage,
      agentType: fields.agentType ?? 'claude',
      paneKey: 'tab-1:leaf-1',
      updatedAt: 1000
    }
  } as unknown as DashboardAgentRowData
}

let root: Root | undefined

afterEach(() => {
  act(() => root?.unmount())
  document.body.replaceChildren()
})

function renderRow(
  agent: DashboardAgentRowData,
  props: Partial<React.ComponentProps<typeof CompactAgentRow>> = {}
): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(
      <TooltipProvider>
        <CompactAgentRow agent={agent} now={2000} onActivate={() => {}} promptLayout {...props} />
      </TooltipProvider>
    )
  })
  return container
}

describe('Prompt session row layout', () => {
  it('puts the session name on line one and the plain-words activity on line two', () => {
    const container = renderRow(
      makeAgent({ toolName: 'Bash', toolInput: 'cd ~/git/runners/prompt' })
    )
    const name = container.querySelector('[data-prompt-session-name]')
    const status = container.querySelector('[data-prompt-session-status]')
    expect(name?.textContent).toBe('[PROMPT] 개선')
    expect(status?.textContent).toBe('Running a command · cd ~/git/runners/prompt')
    expect(container.textContent).not.toContain(' - ')
    expect(container.textContent).not.toContain('Bash:')
  })

  it('drops the Claude mark and draws the line icon instead of the old dot', () => {
    const container = renderRow(makeAgent({}))
    expect(container.querySelector('[data-prompt-session-icon="working"]')).not.toBeNull()
    expect(container.querySelector('[title="Claude"]')).toBeNull()
    const other = renderRow(makeAgent({ agentType: 'codex' }))
    expect(other.querySelector('[title="Codex"]')).not.toBeNull()
  })

  it('folds helpers into one pill that toggles them', () => {
    const onToggle = vi.fn()
    const container = renderRow(makeAgent({}), {
      childAgentCount: 2,
      childAgentsExpanded: false,
      onToggleChildAgents: onToggle
    })
    const pill = container.querySelector<HTMLButtonElement>('[data-prompt-helper-pill]')
    expect(pill?.textContent).toBe('Helpers 2')
    expect(pill?.getAttribute('aria-expanded')).toBe('false')
    act(() => pill?.click())
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('names a helper row by its task, without the "- general-purpose" tail', () => {
    const container = renderRow(
      makeAgent({
        rowSource: 'subagent',
        agentType: 'general-purpose',
        prompt: '목·업데이트 테스트 고치기',
        state: 'working'
      })
    )
    expect(container.querySelector('[data-prompt-session-name]')?.textContent).toBe(
      '목·업데이트 테스트 고치기'
    )
    expect(container.textContent).not.toContain('general-purpose')
  })

  it('swaps the time for a × on hover, on a session row only (2A)', () => {
    const Row = withPromptSessionRowMenu(CompactAgentRow)
    const render = (agent: DashboardAgentRowData): HTMLElement => {
      const container = document.createElement('div')
      document.body.appendChild(container)
      root = createRoot(container)
      act(() => {
        root!.render(
          <TooltipProvider>
            <Row agent={agent} now={2000} onActivate={() => {}} promptLayout />
          </TooltipProvider>
        )
      })
      return container
    }
    const container = render(
      makeAgent({
        tab: { id: 'tab-1', worktreeId: 'wt-1', title: 'x', customTitle: '[PROMPT] 개선' }
      })
    )
    const close = container.querySelector('[data-prompt-session-close]')
    expect(close?.getAttribute('aria-label')).toBe('Close [PROMPT] 개선')
    expect(container.querySelector('[data-prompt-session-menu="tab-1"]')).not.toBeNull()
    const time = [...container.querySelectorAll('span')].find((el) =>
      el.className.includes('tabular-nums')
    )
    expect(time?.className).toContain('group-hover/prompt-session-row:invisible')
    act(() => root?.unmount())

    const helper = render(
      makeAgent({
        rowSource: 'subagent',
        tab: { id: 'tab-1', worktreeId: 'wt-1', title: 'x', customTitle: null }
      })
    )
    expect(helper.querySelector('[data-prompt-session-close]')).toBeNull()
    expect(helper.querySelector('[data-prompt-session-menu]')).toBeNull()
  })

  it('names a fresh session "New Session" until its first conversation (4A)', () => {
    const fresh = renderRow(
      makeAgent({
        state: 'idle',
        prompt: '',
        tab: {
          id: 'tab-1',
          worktreeId: 'wt-1',
          title: '✳ Claude Code',
          customTitle: null
        }
      })
    )
    expect(fresh.querySelector('[data-prompt-session-name]')?.textContent).toBe('New Session')
    act(() => root?.unmount())

    const asked = renderRow(
      makeAgent({
        prompt: 'fix the sidebar',
        tab: {
          id: 'tab-1',
          worktreeId: 'wt-1',
          title: '✳ Claude Code',
          customTitle: null
        }
      })
    )
    expect(asked.querySelector('[data-prompt-session-name]')?.textContent).toBe('fix the sidebar')
  })

  it('drops the role tail from a helper child row (5B)', () => {
    const agent = {
      ...makeAgent({}),
      childRow: {
        name: 'Prompt 간격 고치기',
        displayState: 'working',
        detail: { kind: 'role', agentType: 'general-purpose' },
        recencyAt: 1000
      }
    } as unknown as DashboardAgentRowData
    const container = renderRow(agent)
    expect(container.textContent).toContain('Prompt 간격 고치기')
    expect(container.textContent).not.toContain('general-purpose')
    expect(container.textContent).not.toContain(' - ')
  })
})

describe('Prompt session row after a failed turn', () => {
  const failedRow = (failureKind?: string): DashboardAgentRowData => {
    const agent = makeAgent({ state: 'done' })
    return {
      ...agent,
      entry: {
        ...agent.entry,
        mainAgent: {
          state: 'done',
          outcome: 'failure',
          stateStartedAt: 1000,
          ...(failureKind ? { failureKind } : {})
        }
      }
    } as DashboardAgentRowData
  }

  it('shows the blue "!" and "Sign-in needed" when the turn needs a new sign-in', () => {
    const container = renderRow(failedRow('sign-in'))
    expect(container.querySelector('[data-prompt-session-icon="attention"]')).not.toBeNull()
    expect(container.querySelector('[data-prompt-session-status]')?.textContent).toBe(
      'Sign-in needed'
    )
  })

  it('keeps the red × and "Failed" for any other failure', () => {
    const container = renderRow(failedRow())
    expect(container.querySelector('[data-prompt-session-icon="failed"]')).not.toBeNull()
    expect(container.querySelector('[data-prompt-session-status]')?.textContent).toBe('Failed')
  })
})

describe('promptSessionStatusLine', () => {
  it('says a finished turn is waiting for the person', () => {
    const agent = makeAgent({
      state: 'done',
      lastAssistantMessage: 'All set.'
    })
    expect(promptSessionStatusLine(agent, 'done', 'All set.')).toBe('Done · waiting for you')
  })

  it('rewords background monitoring', () => {
    const agent = makeAgent({ workingMode: 'monitoring' })
    expect(promptSessionStatusLine(agent, 'monitoring', 'Monitoring background tasks')).toBe(
      'Watching background tasks'
    )
  })

  it('says how long a quiet working session has been silent and that it may be stuck', () => {
    const agent = {
      ...makeAgent({ state: 'working' }),
      state: 'unverifiable'
    } as DashboardAgentRowData
    const minute = 60_000
    expect(
      promptSessionStatusLine(agent, 'unverifiable', 'No update in 34m', 1000 + 34 * minute)
    ).toBe('No update for 34 min · may be stuck')
    expect(promptSessionStatusLine(agent, 'unverifiable', '', 1000 + 125 * minute)).toBe(
      'No update for 2 h · may be stuck'
    )
    expect(promptSessionStatusLine(agent, 'unverifiable', '', 1000 + 50 * 60 * minute)).toBe(
      'No update for 2 d · may be stuck'
    )
  })

  it('shows the quiet line in the row, set apart from routine status', () => {
    const agent = {
      ...makeAgent({ state: 'working' }),
      state: 'unverifiable'
    } as DashboardAgentRowData
    const container = renderRow(agent, { now: 1000 + 40 * 60_000 })
    const status = container.querySelector<HTMLElement>('[data-prompt-session-status]')
    expect(status?.textContent).toBe('No update for 40 min · may be stuck')
    expect(status?.className).toContain('text-status-warning-text')
  })

  it('keeps attention and other specific lines as they are', () => {
    const agent = makeAgent({ state: 'waiting' })
    expect(promptSessionStatusLine(agent, 'permission', 'Approve Bash?')).toBe('Approve Bash?')
  })
})

describe('promptSessionIconKind', () => {
  it('maps every row state onto the four looks', () => {
    expect(promptSessionIconKind('working')).toBe('working')
    expect(promptSessionIconKind('permission')).toBe('attention')
    expect(promptSessionIconKind('done')).toBe('done')
    expect(promptSessionIconKind('monitoring')).toBe('waiting')
    expect(promptSessionIconKind('idle')).toBe('waiting')
    expect(promptSessionIconKind('failed')).toBe('failed')
    expect(promptSessionIconKind('interrupted')).toBe('attention')
    expect(promptSessionIconKind('blocked')).toBe('attention')
  })
})

describe('PromptSessionStateIcon done draw', () => {
  afterEach(() => resetPromptSessionIconMemoryForTest())

  function mountIcon(state: AgentDotState): {
    rerender: (next: AgentDotState) => void
    el: () => Element | null
    unmount: () => void
  } {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const iconRoot = createRoot(container)
    const draw = (next: AgentDotState): void =>
      act(() =>
        iconRoot.render(<PromptSessionStateIcon state={next} animationKey="tab-1:leaf-1" />)
      )
    draw(state)
    return {
      rerender: draw,
      el: () => container.querySelector('[data-prompt-session-icon]'),
      unmount: () => act(() => iconRoot.unmount())
    }
  }

  it('draws the check once when a session turns done, never on re-render or remount', () => {
    const icon = mountIcon('working')
    expect(icon.el()?.hasAttribute('data-prompt-done-draw')).toBe(false)
    icon.rerender('done')
    expect(icon.el()?.hasAttribute('data-prompt-done-draw')).toBe(true)
    expect(icon.el()?.querySelector('.a-ring')).not.toBeNull()
    expect(icon.el()?.querySelector('.a-check')).not.toBeNull()
    // A re-render keeps the same element and class, so the running draw is not restarted.
    const ring = icon.el()?.querySelector('circle')
    icon.rerender('done')
    expect(icon.el()?.querySelector('circle')).toBe(ring)
    icon.unmount()

    // Scrolling a virtualized list remounts the row: it shows the finished check, no draw.
    const again = mountIcon('done')
    expect(again.el()?.hasAttribute('data-prompt-done-draw')).toBe(false)
    expect(again.el()?.querySelector('.a-ring')).toBeNull()
    again.unmount()
  })

  it('does not draw for a session that was already done when first shown', () => {
    const icon = mountIcon('done')
    expect(icon.el()?.querySelector('.a-ring')).toBeNull()
    icon.unmount()
  })

  it('draws again after the session works and finishes once more', () => {
    const icon = mountIcon('working')
    icon.rerender('done')
    icon.rerender('working')
    icon.rerender('done')
    expect(icon.el()?.querySelector('.a-ring')).not.toBeNull()
    icon.unmount()
  })

  it('uses the chosen motion classes for the other looks', () => {
    const working = mountIcon('working')
    expect(working.el()?.querySelector('.a-arc')).not.toBeNull()
    working.unmount()
    const ask = mountIcon('permission')
    expect(ask.el()?.querySelector('svg.a-ask')).not.toBeNull()
    ask.unmount()
    const failed = mountIcon('failed')
    const failedSvg = failed.el()?.querySelector('svg')
    expect(failed.el()?.getAttribute('data-prompt-session-icon')).toBe('failed')
    expect(failedSvg?.getAttribute('class')).toBeNull()
    expect(failedSvg?.querySelector('[class]')).toBeNull()
    expect(failedSvg?.querySelector('circle')?.getAttribute('stroke')).toBe('#e5484d')
    failed.unmount()
    const wait = mountIcon('monitoring')
    expect(wait.el()?.querySelector('.a-hand')).not.toBeNull()
    wait.unmount()
  })
})
