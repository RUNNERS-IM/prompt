import { describe, expect, it } from 'vitest'
import bundled from '../../../../../resources/runners-apps/runners-apps.json'
import {
  buildRunnersAppGroups,
  isSafeRunnersAppUrl,
  localizeRunnersText,
  pickRunnersAppsLocale
} from './runners-apps-model'
import { loadPromptRunnersAppGroups } from './prompt-runners-apps-source'

const resolveIcon = (file: string): string => `icons/${file}`

describe('buildRunnersAppGroups', () => {
  it('drops the app itself and keeps the json order', () => {
    const groups = buildRunnersAppGroups(bundled, { selfId: 'prompt', resolveIcon })
    expect(groups.map((g) => g.id)).toEqual(['apps', 'services'])
    expect(groups[0].items.map((i) => i.id)).toEqual(['split', 'monitor'])
    expect(groups[1].items.map((i) => i.id)).toEqual(['sense', 'pudding'])
    expect(groups[0].items[0].iconUrl).toBe('icons/split.png')
  })

  it('skips rows whose url is empty or not https, and groups left empty', () => {
    const groups = buildRunnersAppGroups(
      {
        groups: [
          {
            id: 'apps',
            title: { en: 'Apps' },
            items: [
              { id: 'a', name: 'A', icon: 'a.png', desc: { en: 'a' }, url: '' },
              { id: 'b', name: 'B', icon: 'b.png', desc: { en: 'b' }, url: 'http://x.test' },
              { id: 'c', name: 'C', icon: 'c.png', desc: { en: 'c' }, url: 'file:///etc' },
              { id: 'd', name: 'D', icon: 'd.png', desc: { en: 'd' }, url: ' https://d.test ' }
            ]
          },
          { id: 'empty', title: { en: 'Empty' }, items: [{ id: 'e', name: 'E', url: '' }] }
        ]
      },
      { resolveIcon }
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].items.map((i) => [i.id, i.url])).toEqual([['d', 'https://d.test']])
  })

  it('returns nothing for malformed input and leaves a missing icon empty', () => {
    expect(buildRunnersAppGroups(null, { resolveIcon })).toEqual([])
    expect(buildRunnersAppGroups({ groups: 'x' }, { resolveIcon })).toEqual([])
    const groups = buildRunnersAppGroups(
      { groups: [{ id: 'g', items: [{ id: 'x', name: 'X', icon: 'x.png', url: 'https://x' }] }] },
      { resolveIcon: () => undefined }
    )
    expect(groups[0].items[0].iconUrl).toBe('')
  })
})

describe('locale helpers', () => {
  it('uses Korean only for a Korean UI and falls back to English', () => {
    expect(pickRunnersAppsLocale('ko')).toBe('ko')
    expect(pickRunnersAppsLocale('ko-KR')).toBe('ko')
    expect(pickRunnersAppsLocale('ja')).toBe('en')
    expect(pickRunnersAppsLocale(undefined)).toBe('en')
    expect(localizeRunnersText({ ko: '받기', en: 'Get' }, 'ko')).toBe('받기')
    expect(localizeRunnersText({ en: 'Get' }, 'ko')).toBe('Get')
  })

  it('accepts https urls only', () => {
    expect(isSafeRunnersAppUrl('https://sense.im')).toBe(true)
    expect(isSafeRunnersAppUrl('http://sense.im')).toBe(false)
    expect(isSafeRunnersAppUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeRunnersAppUrl('not a url')).toBe(false)
  })
})

describe('loadPromptRunnersAppGroups', () => {
  it('finds a bundled icon for every row of the bundled list', () => {
    const groups = loadPromptRunnersAppGroups()
    const rows = groups.flatMap((g) => g.items)
    expect(rows.map((r) => r.id)).toEqual(['split', 'monitor', 'sense', 'pudding'])
    for (const row of rows) {
      expect(row.iconUrl).not.toBe('')
    }
  })
})
