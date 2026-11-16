import { describe, expect, it } from 'vitest'
import type { PromptLibraryItem } from '../../../../shared/prompt-library-types'
import { promptUsageKey } from './prompt-library-auto'
import {
  buildPromptLibrarySections,
  removePromptLibraryItem,
  savePromptLibraryDraft
} from './prompt-library-list'

const mine: PromptLibraryItem = { id: 'm', title: '리뷰', body: '바뀐 코드 봐줘', updatedAt: 1 }
const auto: PromptLibraryItem = {
  id: 'a',
  title: '풀',
  body: '싹다 풀 받아줘',
  updatedAt: 1,
  source: 'auto',
  autoKey: 'key-a'
}

describe('buildPromptLibrarySections', () => {
  it('orders mine, used often, then shared', () => {
    const sections = buildPromptLibrarySections(
      [auto, mine],
      [{ id: 's', title: '빌드', body: '빌드 돌려줘' }],
      ''
    )
    expect(sections.map((section) => section.kind)).toEqual(['mine', 'frequent', 'shared'])
    expect(sections[2].rows[0]).toMatchObject({ readOnly: true, item: null })
  })

  it('hides shared rows that repeat a saved id or wording', () => {
    const sections = buildPromptLibrarySections(
      [mine],
      [
        { id: 'm', title: '같은 id', body: '다른 글' },
        { id: 's', title: '같은 글', body: '바뀐 코드  봐줘.' }
      ],
      ''
    )
    expect(sections.map((section) => section.kind)).toEqual(['mine'])
  })

  it('filters every group by the search text', () => {
    const sections = buildPromptLibrarySections(
      [auto, mine],
      [{ id: 's', title: '빌드', body: '빌드 돌려줘' }],
      '빌드'
    )
    expect(sections).toHaveLength(1)
    expect(sections[0].kind).toBe('shared')
    expect(buildPromptLibrarySections([mine], [], '없는 글')).toEqual([])
  })
})

describe('savePromptLibraryDraft', () => {
  it('moves an edited auto row to mine and keeps its key', () => {
    const [edited] = savePromptLibraryDraft([auto], { id: 'a', title: 't', body: 'b' }, 5)
    expect(edited.source).toBeUndefined()
    expect(edited.autoKey).toBe('key-a')
  })
})

describe('removePromptLibraryItem', () => {
  it('remembers deleted wording so it is not added again', () => {
    const result = removePromptLibraryItem([auto, mine], [], 'a')
    expect(result.promptLibrary).toEqual([mine])
    expect(result.promptLibraryDismissedAuto).toEqual(['key-a', promptUsageKey(auto.body)])
  })
})
