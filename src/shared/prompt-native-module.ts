import { realpathSync } from 'node:fs'

/** Exports of every prompt-native file this realm opened, by real path. Anchored to the realm with a global
 * symbol so the main-process loader (src/main/prompt-native.ts), the Windows security loader and any second
 * bundle in the same process share one load: each `process.dlopen` of the file would run its init again. */
const OPENED = Symbol.for('prompt.native.opened')

/** The exports of the prompt-native file at `path`; throws when it is missing or will not load. */
export function openPromptNative(path: string): Record<string, unknown> {
  const realm = globalThis as { [OPENED]?: Map<string, Record<string, unknown>> }
  const opened = (realm[OPENED] ??= new Map())
  const real = realpathSync(path)
  const existing = opened.get(real)
  if (existing) {
    return existing
  }
  // dlopen needs no module base: worker and orcad bundles are CommonJS, where import.meta.url is empty.
  const holder = { exports: {} as Record<string, unknown> }
  process.dlopen(holder, real)
  opened.set(real, holder.exports)
  return holder.exports
}
