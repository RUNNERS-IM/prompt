// Fills a mobile catalog (mobile/src/i18n/locales/<locale>.json) for one or more UI locales.
// Order per key: the existing mobile translation, then the desktop catalog's translation of the
// same key or the same English text (already reviewed for this locale), then machine translation.
// Usage: node config/scripts/bootstrap-mobile-locale-catalog.mjs ar fi hi
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import {
  collectStringLeaves,
  repairTranslatedValue,
  shouldPreserveEnglishValue
} from './locale-translation-policy.mjs'

const MOBILE_DIR = path.join('mobile', 'src', 'i18n', 'locales')
const DESKTOP_DIR = path.join('src', 'renderer', 'src', 'i18n', 'locales')
const PLACEHOLDER_RE = /\{\{[^}]+\}\}/g
const PLURAL_SUFFIX_RE = /_(zero|one|two|few|many|other)$/
// Product and platform names stay in Latin script; "Orca" is swapped for "Prompt" as strings render.
const PROTECTED_TERMS = [
  'Claude Code',
  'RUNNERS',
  'Orca',
  'Prompt',
  'Claude',
  'Codex',
  'Gemini',
  'OpenCode',
  'GitHub',
  'GitLab',
  'Linear',
  'Cursor',
  'Copilot',
  'Tailscale',
  'macOS',
  'iOS',
  'Android',
  'SSH',
  'QR',
  'Mac'
]
const PROTECTED_RE = new RegExp(`(?<![A-Za-z])(?:${PROTECTED_TERMS.join('|')})(?![A-Za-z])`, 'g')
// Google's language codes where they differ from ours.
const TARGET_LANGUAGE = { 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW', pt: 'pt-BR' }

// setLeaf from the policy expects the parents to exist; a fresh catalog has none yet.
function putLeaf(catalog, key, value) {
  const parts = key.split('.')
  let cursor = catalog
  for (const part of parts.slice(0, -1)) {
    cursor[part] ??= {}
    cursor = cursor[part]
  }
  cursor[parts.at(-1)] = value
}

function flatten(catalog) {
  return new Map(collectStringLeaves(catalog).map((leaf) => [leaf.key, leaf.value]))
}

async function readJson(root, file) {
  try {
    return JSON.parse(await fs.readFile(path.join(root, file), 'utf8'))
  } catch {
    return null
  }
}

function protect(text) {
  const tokens = []
  const protectedText = text.replace(
    new RegExp(`${PLACEHOLDER_RE.source}|${PROTECTED_RE.source}`, 'g'),
    (match) => {
      tokens.push(match)
      return `[${tokens.length - 1}]`
    }
  )
  return { protectedText, tokens }
}

function restore(text, tokens) {
  let result = text
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    result = result.replace(new RegExp(`\\[\\s*${index}\\s*\\]`, 'g'), tokens[index])
  }
  return result
}

function sameTokens(a, b) {
  const pick = (value) => (value.match(PLACEHOLDER_RE) ?? []).sort().join('\0')
  return pick(a) === pick(b) && !/\[\s*\d+\s*\]/.test(b.replace(/\[\d+\]\(/g, ''))
}

async function translateText(text, targetLanguage) {
  const url = new URL('https://translate.googleapis.com/translate_a/single')
  url.searchParams.set('client', 'gtx')
  url.searchParams.set('sl', 'en')
  url.searchParams.set('tl', targetLanguage)
  url.searchParams.set('dt', 't')
  url.searchParams.set('q', text)
  // The free endpoint answers 429 for a while after a burst; wait it out instead of failing.
  let lastError
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Translation request failed with status ${response.status}`)
      }
      const payload = await response.json()
      return payload[0].map((part) => part[0]).join('')
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, Math.min(30000 * (attempt + 1), 300000)))
    }
  }
  throw lastError
}

async function mapWithConcurrency(items, concurrency, mapper) {
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next
      next += 1
      await mapper(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
}

// Desktop translations keyed by English text, so mobile strings that read the same reuse them.
function desktopByEnglish(desktopEnglish, desktopLocale) {
  const byEnglish = new Map()
  for (const [key, english] of desktopEnglish) {
    const translated = desktopLocale.get(key)
    if (typeof translated === 'string' && translated.trim() && translated !== english) {
      if (!byEnglish.has(english)) {
        byEnglish.set(english, translated)
      }
    }
  }
  return byEnglish
}

export async function fillLocale(root, locale, cacheDir) {
  const english = flatten(await readJson(root, path.join(MOBILE_DIR, 'en.json')))
  const existingCatalog = (await readJson(root, path.join(MOBILE_DIR, `${locale}.json`))) ?? {}
  const existing = flatten(existingCatalog)
  const desktopEnglish = flatten(await readJson(root, path.join(DESKTOP_DIR, 'en.json')))
  const desktopLocale = flatten(
    (await readJson(root, path.join(DESKTOP_DIR, `${locale}.json`))) ?? {}
  )
  const byEnglish = desktopByEnglish(desktopEnglish, desktopLocale)
  const cachePath = path.join(cacheDir, `${locale}-mobile-catalog-cache.json`)
  const cache = new Map(Object.entries((await readJson('', cachePath)) ?? {}))

  const result = new Map()
  const pending = new Set()
  for (const [key, value] of english) {
    if (existing.has(key)) {
      result.set(key, existing.get(key))
    } else if (shouldPreserveEnglishValue(value, key)) {
      result.set(key, value)
    } else if (
      desktopLocale.has(key) &&
      desktopEnglish.get(key) === value &&
      desktopLocale.get(key) !== value
    ) {
      result.set(key, desktopLocale.get(key))
    } else if (byEnglish.has(value)) {
      result.set(key, byEnglish.get(value))
    } else if (cache.has(value)) {
      result.set(key, cache.get(value))
    } else {
      pending.add(value)
    }
  }

  const target = TARGET_LANGUAGE[locale] ?? locale
  const queue = [...pending]
  const translateOne = async (value) => {
    const { protectedText, tokens } = protect(value)
    const translated = restore(await translateText(protectedText, target), tokens)
    cache.set(value, sameTokens(value, translated) ? translated : null)
  }
  // One request carries a batch of one-line strings, one per line; the free endpoint throttles
  // per request, so batching keeps a 1,500-string catalog to a few dozen calls.
  const batches = []
  let batch = []
  let size = 0
  for (const value of queue) {
    if (value.includes('\n')) {
      batches.push([value])
      continue
    }
    if (batch.length >= 40 || size + value.length > 3500) {
      batches.push(batch)
      batch = []
      size = 0
    }
    batch.push(value)
    size += value.length + 1
  }
  if (batch.length) {
    batches.push(batch)
  }
  let done = 0
  await mapWithConcurrency(batches, 1, async (values) => {
    if (values.length === 1) {
      await translateOne(values[0])
    } else {
      const protectedValues = values.map((value) => protect(value))
      const joined = protectedValues.map((entry) => entry.protectedText).join('\n')
      const lines = (await translateText(joined, target)).split('\n')
      if (lines.length === values.length) {
        values.forEach((value, index) => {
          const translated = restore(lines[index].trim(), protectedValues[index].tokens)
          cache.set(value, sameTokens(value, translated) ? translated : null)
        })
      } else {
        for (const value of values) {
          await translateOne(value)
        }
      }
    }
    done += values.length
    console.log(`  ${locale} ${done}/${queue.length}`)
    await fs.writeFile(cachePath, JSON.stringify(Object.fromEntries(cache)))
    await new Promise((resolve) => setTimeout(resolve, 4000))
  })
  await fs.writeFile(cachePath, JSON.stringify(Object.fromEntries(cache)))

  // Keep every existing entry as it is (plural forms English lacks, reviewed wording, order);
  // only keys the catalog does not have yet are added.
  const catalog = existingCatalog
  let fallbacks = 0
  for (const [key, value] of english) {
    if (existing.has(key)) {
      continue
    }
    const translated = result.get(key) ?? cache.get(value)
    if (typeof translated !== 'string' || !translated.trim()) {
      fallbacks += 1
      continue
    }
    putLeaf(
      catalog,
      key,
      repairTranslatedValue({ key, enValue: value, localeValue: translated, locale })
    )
  }
  addPluralCategories(catalog, english, locale)
  await fs.writeFile(
    path.join(root, MOBILE_DIR, `${locale}.json`),
    `${JSON.stringify(catalog, null, 2)}\n`
  )
  console.log(
    `${locale}: ${english.size - fallbacks} keys written, ${fallbacks} fall back to English`
  )
}

// Arabic and Polish need plural forms English lacks (zero, two, few, many); they reuse "other".
function addPluralCategories(catalog, english, locale) {
  const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories
  const families = new Set(
    [...english.keys()]
      .filter((key) => PLURAL_SUFFIX_RE.test(key))
      .map((key) => key.replace(PLURAL_SUFFIX_RE, ''))
  )
  const flat = flatten(catalog)
  for (const family of families) {
    const other = flat.get(`${family}_other`)
    if (!other) {
      continue
    }
    for (const category of categories) {
      if (!flat.has(`${family}_${category}`)) {
        putLeaf(catalog, `${family}_${category}`, other)
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cacheFlag = process.argv.indexOf('--cache-dir')
  const locales = process.argv
    .slice(2)
    .filter((arg, index) => !arg.startsWith('--') && index + 2 !== cacheFlag + 1)
  const cacheDir = cacheFlag === -1 ? path.join(MOBILE_DIR) : process.argv[cacheFlag + 1]
  for (const locale of locales) {
    await fillLocale(process.cwd(), locale, cacheDir)
  }
}
