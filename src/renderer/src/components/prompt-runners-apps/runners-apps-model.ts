// Data model for the "More apps from RUNNERS" cards. Pure functions only (no React, no Electron),
// so Split and Monitor can copy this file as is. The source list is runners-apps.json, copied from
// ~/git/runners/_docs/작업 가이드/runners-apps.json into each app.

export type RunnersAppsLocale = 'ko' | 'en'

export type RunnersLocalizedText = Partial<Record<RunnersAppsLocale, string>> & { en?: string }

export type RunnersAppItem = {
  id: string
  name: string
  /** Resolved image URL (the json only holds the file name). Empty when no file is bundled. */
  iconUrl: string
  desc: RunnersLocalizedText
  url: string
}

export type RunnersAppGroup = {
  id: string
  title: RunnersLocalizedText
  items: RunnersAppItem[]
}

export type BuildRunnersAppGroupsOptions = {
  /** Id of the app showing the list; it is left out of its own list. */
  selfId?: string
  /** Maps the json "icon" file name (e.g. "split.png") to a loadable URL. */
  resolveIcon: (fileName: string) => string | undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readText(value: unknown): RunnersLocalizedText {
  if (!isRecord(value)) {
    return {}
  }
  const text: RunnersLocalizedText = {}
  if (typeof value.ko === 'string') {
    text.ko = value.ko
  }
  if (typeof value.en === 'string') {
    text.en = value.en
  }
  return text
}

/** Only https links are opened, so a typo or a local path in the json cannot launch anything else. */
export function isSafeRunnersAppUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

/** Turns the parsed json into card groups: drops the app itself, rows without a usable https
 *  url, and groups left empty. Malformed entries are skipped instead of throwing, because the
 *  list is a nice-to-have and must never break the window it sits in. */
export function buildRunnersAppGroups(
  raw: unknown,
  { selfId, resolveIcon }: BuildRunnersAppGroupsOptions
): RunnersAppGroup[] {
  if (!isRecord(raw) || !Array.isArray(raw.groups)) {
    return []
  }
  const groups: RunnersAppGroup[] = []
  for (const group of raw.groups) {
    if (!isRecord(group) || typeof group.id !== 'string' || !Array.isArray(group.items)) {
      continue
    }
    const items: RunnersAppItem[] = []
    for (const item of group.items) {
      if (!isRecord(item) || typeof item.id !== 'string' || typeof item.name !== 'string') {
        continue
      }
      if (item.id === selfId) {
        continue
      }
      const url = typeof item.url === 'string' ? item.url.trim() : ''
      if (!url || !isSafeRunnersAppUrl(url)) {
        continue
      }
      const iconFile = typeof item.icon === 'string' ? item.icon : ''
      items.push({
        id: item.id,
        name: item.name,
        iconUrl: (iconFile && resolveIcon(iconFile)) || '',
        desc: readText(item.desc),
        url
      })
    }
    if (items.length > 0) {
      groups.push({ id: group.id, title: readText(group.title), items })
    }
  }
  return groups
}

/** Korean UI shows Korean text; every other UI language falls back to English. */
export function pickRunnersAppsLocale(language: string | null | undefined): RunnersAppsLocale {
  return language?.toLowerCase().startsWith('ko') ? 'ko' : 'en'
}

export function localizeRunnersText(text: RunnersLocalizedText, locale: RunnersAppsLocale): string {
  return text[locale] || text.en || text.ko || ''
}
