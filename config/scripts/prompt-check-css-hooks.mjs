#!/usr/bin/env node
// Prompt: fails when a class or data attribute that src/renderer/src/assets/prompt-mac.css
// targets no longer appears in the renderer source. Upstream (stablyai/orca) can rename a
// Tailwind class or drop a data-* attribute in the daily merge; the CSS rule then silently
// stops matching and a broken look ships with no error. Run after the merge:
//   node config/scripts/prompt-check-css-hooks.mjs
// Plain Node, no dependencies, so it can run before `pnpm install`.
//
// What it checks, per compound selector (the part between spaces / > / + / ~):
// every class and data-* attribute name (and a quoted attribute value) of that compound must
// appear together in at least one .ts/.tsx/.html file under src/renderer. It cannot prove
// that the element really carries them at runtime, only that the hook still exists.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
const CSS_FILE = join(ROOT, 'src/renderer/src/assets/prompt-mac.css')
const SOURCE_DIR = join(ROOT, 'src/renderer')

// Classes added at runtime by code outside src/renderer (libraries) or by the theme switcher.
const EXTERNAL_CLASSES = new Set(['lucide', 'dark'])

function listSources(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) {
      continue
    }
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      out.push(...listSources(path))
    } else if (/\.(tsx?|html)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) {
      out.push(path)
    }
  }
  return out
}

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function selectorsOf(css) {
  const selectors = []
  for (const match of stripComments(css).matchAll(/([^{}]+)\{/g)) {
    for (const selector of match[1].split(',')) {
      const trimmed = selector.trim()
      if (trimmed && !trimmed.startsWith('@')) {
        selectors.push(trimmed)
      }
    }
  }
  return selectors
}

/** Splits a selector into compounds, ignoring combinators inside [] and (). */
function compoundsOf(selector) {
  const compounds = []
  let depth = 0
  let current = ''
  for (const char of selector) {
    if (char === '[' || char === '(') {
      depth += 1
    }
    if (char === ']' || char === ')') {
      depth -= 1
    }
    if (depth === 0 && /[\s>+~]/.test(char)) {
      if (current) {
        compounds.push(current)
      }
      current = ''
      continue
    }
    current += char
  }
  if (current) {
    compounds.push(current)
  }
  return compounds
}

/** Hook tokens one compound needs; :has()/:not() bodies are checked as their own compounds. */
function tokensOf(compound) {
  const tokens = []
  const nested = []
  const outer = compound.replace(/:(?:has|not|is|where)\(((?:[^()]|\([^()]*\))*)\)/g, (_, body) => {
    nested.push(body)
    return ''
  })
  for (const match of outer.matchAll(/\.((?:\\.|[\w-])+)/g)) {
    const className = match[1].replace(/\\(.)/g, '$1')
    if (!EXTERNAL_CLASSES.has(className) && !className.startsWith('prompt-mac-vibrancy')) {
      tokens.push(className)
    }
  }
  for (const match of outer.matchAll(/\[(data-[\w-]+)(?:[~|^$*]?=\s*(['"])(.*?)\2)?\]/g)) {
    tokens.push(match[1])
    if (match[3]) {
      tokens.push(match[3])
    }
  }
  return { tokens, nested }
}

function collectRequirements(selectors) {
  const requirements = []
  const visit = (selector) => {
    for (const compound of compoundsOf(selector)) {
      const { tokens, nested } = tokensOf(compound)
      if (tokens.length > 0) {
        requirements.push({ selector, tokens })
      }
      for (const body of nested) {
        for (const part of body.split(',')) {
          visit(part.trim())
        }
      }
    }
  }
  selectors.forEach(visit)
  return requirements
}

const css = readFileSync(CSS_FILE, 'utf8')
const sources = listSources(SOURCE_DIR).map((path) => ({
  path,
  text: readFileSync(path, 'utf8')
}))
// prompt-mac-vibrancy is added from prompt-mac-chrome.ts; make sure that still holds.
const requirements = [
  { selector: 'html.prompt-mac-vibrancy', tokens: ['prompt-mac-vibrancy'] },
  ...collectRequirements(selectorsOf(css))
]

const failures = []
const seen = new Set()
for (const { selector, tokens } of requirements) {
  const id = `${selector}::${tokens.join('|')}`
  if (seen.has(id)) {
    continue
  }
  seen.add(id)
  const found = sources.some(({ text }) => tokens.every((token) => text.includes(token)))
  if (!found) {
    failures.push({ selector, tokens })
  }
}

if (failures.length > 0) {
  console.error(`${relative(ROOT, CSS_FILE)} depends on hooks the renderer source no longer has:`)
  for (const { selector, tokens } of failures) {
    console.error(`  ${selector}\n    missing together in one file: ${tokens.join(', ')}`)
  }
  console.error('Update the selector in prompt-mac.css (or the hook in the source) and run again.')
  process.exit(1)
}
console.log(`prompt-mac.css hooks OK (${seen.size} checks over ${sources.length} files).`)
