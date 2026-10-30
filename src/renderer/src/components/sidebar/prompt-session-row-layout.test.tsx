/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CompactAgentRow } from './worktree-card-compact-agent-row'
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
    tab: fields.tab ?? { id: 'tab-1', title: '✳ Claude Code', customTitle: '[PROMPT] 개선' },
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
})

describe('promptSessionStatusLine', () => {
  it('says a finished turn is waiting for the person', () => {
    const agent = makeAgent({ state: 'done', lastAssistantMessage: 'All set.' })
    expect(promptSessionStatusLine(agent, 'done', 'All set.')).toBe('Done · waiting for you')
  })

  it('rewords background monitoring', () => {
    const agent = makeAgent({ workingMode: 'monitoring' })
    expect(promptSessionStatusLine(agent, 'monitoring', 'Monitoring background tasks')).toBe(
      'Watching background tasks'
    )
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
    const wait = mountIcon('monitoring')
    expect(wait.el()?.querySelector('.a-hand')).not.toBeNull()
    wait.unmount()
  })
})
