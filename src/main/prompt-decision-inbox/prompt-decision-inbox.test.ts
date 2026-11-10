import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parsePromptDecisionFileName } from '../../shared/prompt-decision-inbox'
import { listPromptDecisionDrafts, promptDecisionFoldersToRead } from './prompt-decision-inbox'

const directories: string[] = []

function folder(): string {
  const directory = mkdtempSync(join(tmpdir(), 'prompt-decisions-'))
  directories.push(directory)
  return directory
}

function page(
  directory: string,
  name: string,
  seconds: number,
  body = '<div id="choice-bar">'
): void {
  const path = join(directory, name)
  writeFileSync(path, body)
  utimesSync(path, seconds, seconds)
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('prompt decision inbox', () => {
  it('splits at the first separator so session names keep their hyphens', () => {
    expect(parsePromptDecisionFileName('[RUNNERS] m2-pro-1 - 앱 - 묶음.html')).toEqual({
      sessionName: '[RUNNERS] m2-pro-1',
      topic: '앱 - 묶음'
    })
    expect(parsePromptDecisionFileName('[SENSE] DB 장애 대응.html')).toBeNull()
  })

  it('lists choice pages newest first and prefers the original over its desktop copy', async () => {
    const shared = folder()
    const desktop = folder()
    page(shared, '[A] 개발 - 첫째.html', 100)
    page(desktop, '[A] 개발 - 첫째.html', 900)
    page(desktop, '[B] 개발 - 둘째.html', 200)
    page(desktop, '[C] 개발 - 답 칸 없음.html', 300, '<p>report</p>')
    const drafts = await listPromptDecisionDrafts([shared, desktop])
    expect(drafts.map((draft) => [draft.topic, draft.filePath.startsWith(shared)])).toEqual([
      ['둘째', false],
      ['첫째', true]
    ])
  })

  it('never reads the desktop without the shared folder', async () => {
    const desktop = folder()
    await expect(
      promptDecisionFoldersToRead({ shared: join(desktop, 'missing'), desktop })
    ).resolves.toEqual([])
  })
})
