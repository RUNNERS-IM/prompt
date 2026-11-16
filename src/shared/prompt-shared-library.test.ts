import { describe, expect, it } from 'vitest'
import { parseSharedPromptLibrary } from './prompt-shared-library'

describe('parseSharedPromptLibrary', () => {
  it('reads valid items and trims them', () => {
    const text = JSON.stringify({
      version: 1,
      promptLibrary: [{ id: ' a ', title: ' 풀 받기 ', body: ' 싹다 풀 받아줘 ' }]
    })
    expect(parseSharedPromptLibrary(text)).toEqual([
      { id: 'a', title: '풀 받기', body: '싹다 풀 받아줘' }
    ])
  })

  it('skips broken rows and repeated ids', () => {
    const text = JSON.stringify({
      promptLibrary: [
        { id: 'a', title: 'A', body: 'one' },
        { id: 'a', title: 'A2', body: 'two' },
        { id: 'b', title: '', body: 'empty title' },
        { id: 3, title: 'C', body: 'number id' },
        null
      ]
    })
    expect(parseSharedPromptLibrary(text)).toEqual([{ id: 'a', title: 'A', body: 'one' }])
  })

  it('returns an empty list for bad files', () => {
    expect(parseSharedPromptLibrary('not json')).toEqual([])
    expect(parseSharedPromptLibrary('{"promptLibrary":{}}')).toEqual([])
    expect(parseSharedPromptLibrary('null')).toEqual([])
  })
})
