import { describe, expect, it } from 'vitest'
import en from '../renderer/src/i18n/locales/en.json'
import ko from '../renderer/src/i18n/locales/ko.json'
import {
  PROMPT_KO_FILL,
  PROMPT_KO_WORDING,
  PROMPT_LOCALE_OVERRIDES,
  applyPromptLocaleOverrides
} from './prompt-locale-overrides'

function lookup(catalog: unknown, key: string): unknown {
  let node = catalog
  for (const segment of key.split('.')) {
    if (node === null || typeof node !== 'object') {
      return undefined
    }
    node = (node as Record<string, unknown>)[segment]
  }
  return node
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{[^}]+\}\}|<\/?\d+>/g)].map((match) => match[0]).sort()
}

describe('Prompt locale overrides', () => {
  const upstreamKeys = { ...PROMPT_KO_FILL, ...PROMPT_KO_WORDING }

  it('only names keys that upstream en.json still has', () => {
    // A failure here usually means the daily merge renamed or removed a key: update the override.
    const missing = Object.keys(upstreamKeys).filter((key) => typeof lookup(en, key) !== 'string')
    expect(missing).toEqual([])
  })

  it('keeps every placeholder of the English text', () => {
    const mismatched = Object.entries(upstreamKeys).filter(
      ([key, value]) =>
        JSON.stringify(placeholders(value)) !==
        JSON.stringify(placeholders(String(lookup(en, key))))
    )
    expect(mismatched).toEqual([])
  })

  it('lays the overrides over the Korean catalog without mutating it', () => {
    const before = JSON.stringify(ko)
    const merged = applyPromptLocaleOverrides('ko', ko)
    expect(JSON.stringify(ko)).toBe(before)
    expect(lookup(merged, 'auto.components.sidebar.WorktreeContextMenu.439fa94d53')).toBe(
      '이름 · 메모 바꾸기'
    )
    expect(lookup(merged, 'prompt.settings.sidebarTitle')).toBe('Prompt 설정')
    for (const key of Object.keys(PROMPT_KO_FILL)) {
      expect(typeof lookup(merged, key)).toBe('string')
    }
    // Untouched neighbours survive the copy.
    expect(lookup(merged, 'agentLaunch.opencode.updateRequired')).toBe(
      lookup(ko, 'agentLaunch.opencode.updateRequired')
    )
  })

  it('lets a later upstream translation win over a fill entry', () => {
    const [key] = Object.keys(PROMPT_KO_FILL)
    const catalog: Record<string, unknown> = {}
    const segments = key.split('.')
    let node = catalog
    for (const segment of segments.slice(0, -1)) {
      node[segment] = {}
      node = node[segment] as Record<string, unknown>
    }
    node[segments.at(-1) as string] = 'upstream'
    expect(lookup(applyPromptLocaleOverrides('ko', catalog), key)).toBe('upstream')
  })

  it('leaves other languages alone', () => {
    const catalog = { a: 'b' }
    expect(applyPromptLocaleOverrides('ja', catalog)).toBe(catalog)
    expect(Object.keys(PROMPT_LOCALE_OVERRIDES)).toEqual(['ko'])
  })
})
