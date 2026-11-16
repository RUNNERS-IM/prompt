import { describe, expect, it } from 'vitest'
import type { PromptLibraryUsageEntry } from '../../../../shared/prompt-library-types'
import {
  AUTO_PROMPT_MAX_ITEMS,
  AUTO_PROMPT_MIN_COUNT,
  pickAutoPrompts,
  promptUsageKey,
  recordPromptUse
} from './prompt-library-auto'

describe('promptUsageKey', () => {
  it('groups spacing, punctuation, case and leading fillers', () => {
    const key = promptUsageKey('싹다 풀 받아줘')
    expect(key).not.toBeNull()
    expect(promptUsageKey('싹다 풀받아줘')).toBe(key)
    expect(promptUsageKey('일단 싹다 풀 받아줘!')).toBe(key)
    expect(promptUsageKey('Run The Tests.')).toBe(promptUsageKey('run the tests'))
  })

  it('groups variants that share the first sentence', () => {
    expect(promptUsageKey('그룹별로 커밋 해줘. CLuade 같은 문구는 메세지에 추가X')).toBe(
      promptUsageKey('그룹별로 커밋해줘. Claude 문구는 빼줘')
    )
  })

  it('ignores short replies, slash commands, choice answers and long pastes', () => {
    expect(promptUsageKey('ㄱㄱ')).toBeNull()
    expect(promptUsageKey('/plan-work')).toBeNull()
    expect(promptUsageKey('1B 2A 3C 4B')).toBeNull()
    expect(promptUsageKey('https://example.com/a')).toBeNull()
    expect(promptUsageKey('가'.repeat(301))).toBeNull()
    expect(promptUsageKey('<task-notification>done</task-notification>')).toBeNull()
  })
})

describe('recordPromptUse', () => {
  it('counts once per turn and keeps the most used wording', () => {
    let usage: Record<string, PromptLibraryUsageEntry> = {}
    usage = recordPromptUse(usage, '싹다 풀받아줘', 'p|1', 1) ?? usage
    usage = recordPromptUse(usage, '싹다 풀 받아줘', 'p|2', 2) ?? usage
    usage = recordPromptUse(usage, '싹다 풀 받아줘', 'p|3', 3) ?? usage
    expect(recordPromptUse(usage, '싹다 풀 받아줘', 'p|3', 4)).toBeNull()
    const entry = Object.values(usage)[0]
    expect(Object.keys(usage)).toHaveLength(1)
    expect(entry.count).toBe(3)
    expect(entry.text).toBe('싹다 풀 받아줘')
  })
})

function usageWith(text: string, count: number): Record<string, PromptLibraryUsageEntry> {
  const key = promptUsageKey(text) as string
  return { [key]: { text, count, lastAt: 1, variants: { [text]: count }, turns: [] } }
}

describe('pickAutoPrompts', () => {
  const base = { library: [], shared: [], dismissed: [], now: 10 }

  it('adds a prompt once it reaches the threshold', () => {
    expect(
      pickAutoPrompts({ ...base, usage: usageWith('빌드 돌려줘', AUTO_PROMPT_MIN_COUNT - 1) })
    ).toEqual([])
    const [added] = pickAutoPrompts({
      ...base,
      usage: usageWith('빌드 돌려줘', AUTO_PROMPT_MIN_COUNT)
    })
    expect(added).toMatchObject({ title: '빌드 돌려줘', body: '빌드 돌려줘', source: 'auto' })
  })

  it('skips dismissed keys and text already saved or shared', () => {
    const usage = usageWith('싹다 풀 받아줘', 9)
    const key = Object.keys(usage)[0]
    expect(pickAutoPrompts({ ...base, usage, dismissed: [key] })).toEqual([])
    expect(
      pickAutoPrompts({ ...base, usage, shared: [{ id: 's', title: '풀', body: '싹다 풀받아줘' }] })
    ).toEqual([])
    expect(
      pickAutoPrompts({
        ...base,
        usage,
        library: [{ id: 'm', title: '풀', body: '일단 싹다 풀 받아줘', updatedAt: 1 }]
      })
    ).toEqual([])
  })

  it('keeps at most the auto item limit', () => {
    const usage = Object.assign(
      {},
      ...Array.from({ length: AUTO_PROMPT_MAX_ITEMS + 3 }, (_, i) =>
        usageWith(`작업 번호 ${i} 진행해줘`, 6)
      )
    )
    expect(pickAutoPrompts({ ...base, usage })).toHaveLength(AUTO_PROMPT_MAX_ITEMS)
  })
})
