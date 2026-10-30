import { describe, expect, it } from 'vitest'
import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import {
  buildPromptSessionSummary,
  collapsePromptHomeFolder,
  countRunningChildren,
  formatPromptDuration,
  formatPromptStatusLine
} from './prompt-session-summary-model'

const MINUTE = 60_000
const NOW = 1_800_000_000_000

function row(
  paneKey: string,
  overrides: Partial<DashboardAgentRow> = {},
  entry: Partial<DashboardAgentRow['entry']> = {}
): DashboardAgentRow {
  return {
    paneKey,
    agentType: 'claude',
    rowSource: 'live',
    state: 'working',
    startedAt: NOW - 30 * MINUTE,
    tab: {
      id: `tab-${paneKey}`,
      title: '✳ claude',
      customTitle: '[MONITOR] dev',
      worktreeId: 'wt'
    },
    entry: {
      state: 'working',
      prompt: '',
      updatedAt: NOW,
      stateStartedAt: NOW - 12 * MINUTE,
      paneKey,
      stateHistory: [],
      model: 'Opus 5.5',
      ...entry
    },
    ...overrides
  } as DashboardAgentRow
}

describe('formatPromptDuration', () => {
  it('formats minutes and hours, and nothing under a minute', () => {
    expect(formatPromptDuration(30_000)).toBeNull()
    expect(formatPromptDuration(12 * MINUTE)).toBe('12m')
    expect(formatPromptDuration(60 * MINUTE)).toBe('1h')
    expect(formatPromptDuration(65 * MINUTE)).toBe('1h 5m')
  })
})

describe('formatPromptStatusLine', () => {
  it('says how long an ongoing state has lasted', () => {
    expect(formatPromptStatusLine('working', NOW - 12 * MINUTE, NOW)).toBe('Working · 12m')
  })

  it('says how long ago a finished state began', () => {
    expect(formatPromptStatusLine('done', NOW - 3 * MINUTE, NOW)).toBe('Done · 3m ago')
  })

  it('handles a fresh state and an unknown start', () => {
    expect(formatPromptStatusLine('working', NOW - 5_000, NOW)).toBe('Working · just now')
    expect(formatPromptStatusLine('idle', 0, NOW)).toBe('Idle')
  })
})

describe('collapsePromptHomeFolder', () => {
  it('shortens home folders to ~', () => {
    expect(collapsePromptHomeFolder('/Users/runners/git/runners')).toBe('~/git/runners')
    expect(collapsePromptHomeFolder('/home/dev')).toBe('~')
    expect(collapsePromptHomeFolder('/opt/work')).toBe('/opt/work')
    expect(collapsePromptHomeFolder(undefined)).toBe('')
  })
})

describe('countRunningChildren', () => {
  it('counts only working children of this session', () => {
    const parent = row('p')
    const rows = [
      parent,
      row('c1', { rowSource: 'subagent' }, { orchestration: { parentPaneKey: 'p' } as never }),
      row(
        'c2',
        { rowSource: 'subagent', state: 'done' },
        { orchestration: { parentPaneKey: 'p' } as never }
      ),
      row('other')
    ]
    expect(countRunningChildren(parent, rows)).toBe(1)
    expect(countRunningChildren(rows[3], rows)).toBe(0)
  })
})

describe('buildPromptSessionSummary', () => {
  it('collects name, model, status, task, folder and running subagents', () => {
    const parent = row('p')
    const child = row(
      'c1',
      { rowSource: 'subagent' },
      { orchestration: { parentPaneKey: 'p' } as never }
    )
    expect(
      buildPromptSessionSummary({
        row: parent,
        rows: [parent, child],
        task: ' Searching for menu bar code ',
        folderPath: '/Users/runners/git/runners',
        now: NOW
      })
    ).toEqual({
      name: '[MONITOR] dev',
      model: 'Opus 5.5',
      status: 'Working · 12m',
      task: 'Searching for menu bar code',
      folder: '~/git/runners',
      runningSubagents: 1
    })
  })
})
