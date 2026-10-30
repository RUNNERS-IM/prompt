import { runProcess } from '@orca/process-host'
import { loadPromptNative } from '../prompt-native'

// Prompt's native module reads phys_footprint via proc_pid_rusage in a few ms, so every 2 s resource poll can use it.
// One `top` sample costs ~0.3-0.6 s of CPU, so without the native module the 2 s resource poll reuses it for this long.
export const DARWIN_FOOTPRINT_REFRESH_MS = 10_000
const SAMPLE_TIMEOUT_MS = 5_000
const SAMPLE_MAX_BUFFER = 4 * 1024 * 1024

const UNIT_BYTES: Record<string, number> = {
  B: 1,
  K: 1024,
  M: 1024 ** 2,
  G: 1024 ** 3,
  T: 1024 ** 4
}

type FootprintSource = {
  refreshMs: number
  read: () => Promise<Map<number, number> | null>
}

let cache: { sampledAt: number; footprints: ReadonlyMap<number, number> } | null = null
let inflight: Promise<ReadonlyMap<number, number> | null> | null = null
let nativeAvailable: boolean | undefined
let supported = true

/** Parses `top -l 1 -stats pid,mem`; MEM is phys_footprint, the figure Activity Monitor shows. */
export function parseTopFootprints(stdout: string): Map<number, number> {
  const footprints = new Map<number, number>()
  let inTable = false
  for (const line of stdout.split('\n')) {
    if (!inTable) {
      inTable = /^\s*PID\s+MEM\s*$/.test(line)
      continue
    }
    const match = /^\s*(\d+)\s+([\d.]+)([BKMGT])[+-]?\s*$/.exec(line)
    if (!match) {
      continue
    }
    const bytes = Number.parseFloat(match[2]) * UNIT_BYTES[match[3]]
    if (Number.isFinite(bytes) && bytes >= 0) {
      footprints.set(Number.parseInt(match[1], 10), Math.round(bytes))
    }
  }
  return footprints
}

const NATIVE_SOURCE: FootprintSource = { refreshMs: 0, read: readNativeFootprints }
const TOP_SOURCE: FootprintSource = {
  refreshMs: DARWIN_FOOTPRINT_REFRESH_MS,
  read: readTopFootprints
}

function currentSource(): FootprintSource {
  nativeAvailable ??= loadPromptNative() !== null
  return nativeAvailable ? NATIVE_SOURCE : TOP_SOURCE
}

/** Per-pid physical footprint on macOS, or null when unavailable (callers fall back to RSS). */
export async function readDarwinProcessFootprints(
  now = Date.now()
): Promise<ReadonlyMap<number, number> | null> {
  if (!supported) {
    return null
  }
  const source = currentSource()
  if (cache && now - cache.sampledAt < source.refreshMs) {
    return cache.footprints
  }
  inflight ??= sampleFootprints(source).finally(() => {
    inflight = null
  })
  return inflight
}

async function sampleFootprints(
  source: FootprintSource
): Promise<ReadonlyMap<number, number> | null> {
  const footprints = await source.read()
  if (footprints) {
    cache = { sampledAt: Date.now(), footprints }
    return footprints
  }
  // A transient failure keeps the last good sample; a source that never answered is dropped.
  if (cache) {
    return cache.footprints
  }
  if (source !== TOP_SOURCE) {
    // A native module that loads but cannot read degrades to the slower top path rather than RSS.
    nativeAvailable = false
    return sampleFootprints(TOP_SOURCE)
  }
  supported = false
  return null
}

async function readNativeFootprints(): Promise<Map<number, number> | null> {
  try {
    const entries = (await loadPromptNative()?.processFootprints()) ?? []
    const footprints = new Map(entries.map(({ pid, bytes }) => [pid, bytes]))
    return footprints.size > 0 ? footprints : null
  } catch {
    return null
  }
}

async function readTopFootprints(): Promise<Map<number, number> | null> {
  try {
    const result = await runProcess({
      program: '/usr/bin/top',
      args: ['-l', '1', '-stats', 'pid,mem'],
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
      maxOutputBytes: SAMPLE_MAX_BUFFER,
      timeoutMs: SAMPLE_TIMEOUT_MS
    })
    const footprints =
      result.code === 0 && !result.timedOut ? parseTopFootprints(result.stdout) : null
    return footprints && footprints.size > 0 ? footprints : null
  } catch {
    // Restricted hosts may lack top; callers fall back to RSS.
    return null
  }
}
