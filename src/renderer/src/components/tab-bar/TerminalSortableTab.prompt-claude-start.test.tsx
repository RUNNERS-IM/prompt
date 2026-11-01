import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'

const seen = vi.hoisted(() => ({
  props: [] as { title: string; customTitle: unknown; agent: unknown }[]
}))
const startBox = vi.hoisted(() => ({ ids: new Set<string>(), agent: null as string | null }))

vi.mock('./SortableTab', () => ({
  default: (props: { tab: TerminalTab; agent: unknown }) => {
    seen.props.push({
      title: props.tab.title,
      customTitle: props.tab.customTitle,
      agent: props.agent
    })
    return null
  }
}))
vi.mock('@/lib/use-tab-agent', () => ({ useTabAgent: () => startBox.agent }))
vi.mock('../prompt-claude-model-menu', () => ({ PromptClaudeModelTabBadge: () => null }))
vi.mock('../prompt-session-card/PromptSessionCard', () => ({ PromptTabSessionDetails: () => null }))
vi.mock('../prompt-claude-start/prompt-claude-start-tabs', () => ({
  usePromptClaudeStartTab: (tabId: string) => startBox.ids.has(tabId)
}))

import TerminalSortableTab from './TerminalSortableTab'

function render(tab: Partial<TerminalTab>): (typeof seen.props)[number] {
  seen.props.length = 0
  const props = {
    tab: { id: 't1', title: 'Terminal 2', customTitle: null, ...tab }
  } as unknown as Parameters<typeof TerminalSortableTab>[0]
  renderToStaticMarkup(<TerminalSortableTab {...props} />)
  return seen.props[0]!
}

describe('TerminalSortableTab for a tab on the new-Claude start box', () => {
  beforeEach(() => {
    startBox.ids.clear()
    startBox.agent = null
  })

  it('reads "Claude" with the Claude icon instead of its "Terminal N" stand-in', () => {
    startBox.ids.add('t1')
    expect(render({})).toEqual({ title: 'Claude', customTitle: null, agent: 'claude' })
  })

  it('keeps a name the person set', () => {
    startBox.ids.add('t1')
    expect(render({ customTitle: 'Review' })).toMatchObject({ customTitle: 'Review' })
  })

  it('leaves an ordinary or started Claude tab as it was', () => {
    startBox.agent = 'claude'
    expect(render({ title: 'Terminal 3' })).toEqual({
      title: 'Terminal 3',
      customTitle: null,
      agent: 'claude'
    })
    startBox.agent = null
    expect(render({ title: 'zsh' })).toEqual({ title: 'zsh', customTitle: null, agent: null })
  })
})
