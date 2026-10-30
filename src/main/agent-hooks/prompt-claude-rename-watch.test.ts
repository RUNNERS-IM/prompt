import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PromptClaudeSessionTitleEvent } from '../../shared/prompt-claude-session-title'
import {
  createPromptClaudeRenameWatch,
  latestClaudeCustomTitle,
  type PromptClaudeRenameTarget
} from './prompt-claude-rename-watch'

const SESSION = 'session-1'

function customTitleLine(title: string, sessionId = SESSION): string {
  return `${JSON.stringify({ type: 'custom-title', customTitle: title, sessionId })}\n`
}

describe('latestClaudeCustomTitle', () => {
  it('returns the newest non-empty title for this session only', () => {
    const text = [
      customTitleLine('first'),
      '{"type":"user","message":{"content":"mentions \\"custom-title\\" in text"}}\n',
      customTitleLine('other session', 'session-2'),
      customTitleLine('  second  '),
      customTitleLine('   '),
      '{"type":"custom-title", broken\n'
    ].join('')
    expect(latestClaudeCustomTitle(text, SESSION)).toBe('second')
  })
})

describe('createPromptClaudeRenameWatch', () => {
  let dir: string
  let transcriptPath: string
  let targets: PromptClaudeRenameTarget[]
  let events: PromptClaudeSessionTitleEvent[]
  let stopTimer: ReturnType<typeof vi.fn<() => void>>
  let timerRunning: boolean

  const createWatch = () =>
    createPromptClaudeRenameWatch({
      listTargets: () => targets,
      onTitle: (event) => events.push(event),
      every: () => {
        timerRunning = true
        return () => {
          timerRunning = false
          stopTimer()
        }
      }
    })

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'prompt-rename-watch-'))
    transcriptPath = join(dir, `${SESSION}.jsonl`)
    writeFileSync(transcriptPath, customTitleLine('old name'))
    targets = [{ paneKey: 'tab-1:leaf-1', sessionId: SESSION, transcriptPath }]
    events = []
    stopTimer = vi.fn<() => void>()
    timerRunning = false
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports a rename appended after it starts watching, once per new title', async () => {
    const watch = createWatch()
    watch.reconcile()
    expect(timerRunning).toBe(true)
    await watch.poll()
    expect(events).toEqual([])

    appendFileSync(transcriptPath, customTitleLine('new name'))
    await watch.poll()
    // Claude re-appends the current title on later turns; that is not a new rename.
    appendFileSync(transcriptPath, customTitleLine('new name'))
    await watch.poll()
    appendFileSync(transcriptPath, customTitleLine('newer name'))
    await watch.poll()

    expect(events).toEqual([
      { paneKey: 'tab-1:leaf-1', sessionId: SESSION, title: 'new name' },
      { paneKey: 'tab-1:leaf-1', sessionId: SESSION, title: 'newer name' }
    ])
  })

  it('waits for a partly written line to finish', async () => {
    const watch = createWatch()
    watch.reconcile()
    await watch.poll()

    const line = customTitleLine('이름 바꿈')
    const bytes = Buffer.from(line)
    appendFileSync(transcriptPath, bytes.subarray(0, 30))
    await watch.poll()
    expect(events).toEqual([])

    appendFileSync(transcriptPath, bytes.subarray(30))
    await watch.poll()
    expect(events.map((event) => event.title)).toEqual(['이름 바꿈'])
  })

  it('stops watching a pane whose Claude row is gone and restarts for a new session', async () => {
    const watch = createWatch()
    watch.reconcile()
    await watch.poll()

    targets = []
    watch.reconcile()
    expect(watch.watchedPaneKeys()).toEqual([])
    expect(stopTimer).toHaveBeenCalledTimes(1)
    appendFileSync(transcriptPath, customTitleLine('after close'))
    await watch.poll()
    expect(events).toEqual([])

    const nextPath = join(dir, 'session-2.jsonl')
    writeFileSync(nextPath, customTitleLine('history', 'session-2'))
    targets = [{ paneKey: 'tab-1:leaf-1', sessionId: 'session-2', transcriptPath: nextPath }]
    watch.reconcile()
    await watch.poll()
    appendFileSync(nextPath, customTitleLine('renamed', 'session-2'))
    await watch.poll()
    expect(events).toEqual([{ paneKey: 'tab-1:leaf-1', sessionId: 'session-2', title: 'renamed' }])
  })
})
