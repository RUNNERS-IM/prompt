import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'

vi.mock('@/store', () => ({
  useAppStore: Object.assign((selector: (s: unknown) => unknown) => selector({}), {
    getState: () => ({})
  })
}))

import { isSessionRow, pickTabSessionRow, PromptSessionSummaryRows } from './PromptSessionCard'

function row(paneKey: string, tabId: string, extra: Partial<DashboardAgentRow> = {}) {
  return {
    paneKey,
    tab: { id: tabId },
    rowSource: 'live',
    ...extra
  } as DashboardAgentRow
}

describe('PromptSessionSummaryRows', () => {
  it('lists each known value under its label', () => {
    const markup = renderToStaticMarkup(
      <PromptSessionSummaryRows
        summary={{
          name: '[MONITOR] dev',
          model: 'Opus 5.5',
          status: 'Working · 12m',
          task: 'Searching for menu bar code',
          folder: '~/git/runners',
          runningSubagents: 2
        }}
      />
    )
    for (const text of [
      'Model',
      'Opus 5.5',
      'Working · 12m',
      'Searching for menu bar code',
      '~/git/runners',
      '2 running'
    ]) {
      expect(markup).toContain(text)
    }
  })

  it('leaves out empty values and the subagent line when none run', () => {
    const markup = renderToStaticMarkup(
      <PromptSessionSummaryRows
        summary={{
          name: 'x',
          model: '',
          status: 'Idle',
          task: '',
          folder: '',
          runningSubagents: 0
        }}
      />
    )
    expect(markup).toContain('Idle')
    expect(markup).not.toContain('Model')
    expect(markup).not.toContain('Task')
    expect(markup).not.toContain('Subagents')
  })
})

describe('pickTabSessionRow', () => {
  it('prefers the focused pane, then any session row of the tab', () => {
    const rows = [row('t1:a', 't1'), row('t1:b', 't1'), row('t2:a', 't2')]
    expect(pickTabSessionRow(rows, 't1', 't1:b')?.paneKey).toBe('t1:b')
    expect(pickTabSessionRow(rows, 't1', null)?.paneKey).toBe('t1:a')
    expect(pickTabSessionRow(rows, 't3', null)).toBeUndefined()
  })

  it('never picks a subagent row', () => {
    const rows = [row('sub', 't1', { rowSource: 'subagent' })]
    expect(pickTabSessionRow(rows, 't1', 'sub')).toBeUndefined()
    expect(isSessionRow(rows[0])).toBe(false)
  })
})
