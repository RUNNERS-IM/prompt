import { open, stat } from 'node:fs/promises'
import type { PromptClaudeSessionTitleEvent } from '../../shared/prompt-claude-session-title'
import { asRecord } from '../ai-vault/session-scanner-record-value'
import { normalizeTitleText } from '../ai-vault/session-scanner-text-normalization'

/** A live Claude pane whose transcript is read for `/rename`. */
export type PromptClaudeRenameTarget = {
  paneKey: string
  sessionId: string
  transcriptPath: string
}

type WatchEntry = {
  target: PromptClaudeRenameTarget
  /** Bytes already read; null until the first stat, which starts at the end so history is not replayed. */
  offset: number | null
  /** The read began mid-line; drop bytes up to the first newline. */
  skipPartialLine: boolean
  lastTitle: string | null
  busy: boolean
}

export type PromptClaudeRenameWatchDeps = {
  listTargets: () => PromptClaudeRenameTarget[]
  onTitle: (event: PromptClaudeSessionTitleEvent) => void
  statSize?: (path: string) => Promise<number | null>
  readRange?: (path: string, start: number, length: number) => Promise<Buffer>
  intervalMs?: number
  /** Starts a repeating timer and returns its stop function. */
  every?: (callback: () => void, ms: number) => () => void
}

export type PromptClaudeRenameWatch = {
  reconcile: () => void
  poll: () => Promise<void>
  stop: () => void
  watchedPaneKeys: () => string[]
}

const DEFAULT_INTERVAL_MS = 1_000
// A tool result can append megabytes at once; a rename record is one short line at the end.
const MAX_READ_BYTES = 4 * 1024 * 1024
const NEWLINE = 0x0a

/** The newest non-empty custom title in these transcript lines, normalized as the AI vault does. */
export function latestClaudeCustomTitle(text: string, sessionId: string): string | null {
  let latest: string | null = null
  for (const line of text.split('\n')) {
    // Skip JSON parsing for the many lines that cannot be a rename record.
    if (!line.includes('"custom-title"')) {
      continue
    }
    let record: Record<string, unknown> | null
    try {
      record = asRecord(JSON.parse(line))
    } catch {
      continue
    }
    if (!record) {
      continue
    }
    const { type, customTitle, sessionId: recordSessionId } = record
    if (type !== 'custom-title' || typeof customTitle !== 'string') {
      continue
    }
    if (typeof recordSessionId === 'string' && recordSessionId !== sessionId) {
      continue
    }
    const title = normalizeTitleText(customTitle)?.trim()
    if (title) {
      latest = title
    }
  }
  return latest
}

async function defaultStatSize(path: string): Promise<number | null> {
  try {
    const stats = await stat(path)
    return stats.isFile() ? stats.size : null
  } catch {
    return null
  }
}

async function defaultReadRange(path: string, start: number, length: number): Promise<Buffer> {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, start)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

function everyInterval(callback: () => void, ms: number): () => void {
  const handle = setInterval(callback, ms)
  // A poll timer alone must not keep the process alive at quit.
  handle.unref?.()
  return () => clearInterval(handle)
}

function sameTarget(left: PromptClaudeRenameTarget, right: PromptClaudeRenameTarget): boolean {
  return left.sessionId === right.sessionId && left.transcriptPath === right.transcriptPath
}

/**
 * Polls the transcripts of live Claude panes and reports a changed custom title. Claude re-appends
 * the same record often, so only a title that differs from the last one seen is reported.
 */
export function createPromptClaudeRenameWatch(
  deps: PromptClaudeRenameWatchDeps
): PromptClaudeRenameWatch {
  const statSize = deps.statSize ?? defaultStatSize
  const readRange = deps.readRange ?? defaultReadRange
  const every = deps.every ?? everyInterval
  const entries = new Map<string, WatchEntry>()
  let stopTimer: (() => void) | null = null

  const syncTimer = (): void => {
    if (entries.size > 0 && stopTimer === null) {
      stopTimer = every(() => void poll(), deps.intervalMs ?? DEFAULT_INTERVAL_MS)
    } else if (entries.size === 0 && stopTimer !== null) {
      stopTimer()
      stopTimer = null
    }
  }

  const reconcile = (): void => {
    const targets = new Map<string, PromptClaudeRenameTarget>()
    for (const target of deps.listTargets()) {
      targets.set(target.paneKey, target)
    }
    for (const paneKey of entries.keys()) {
      if (!targets.has(paneKey)) {
        entries.delete(paneKey)
      }
    }
    for (const [paneKey, target] of targets) {
      const existing = entries.get(paneKey)
      if (existing && sameTarget(existing.target, target)) {
        continue
      }
      // A new session in the same pane (/clear, resume) starts over at its own transcript's end.
      entries.set(paneKey, {
        target,
        offset: null,
        skipPartialLine: false,
        lastTitle: null,
        busy: false
      })
    }
    syncTimer()
  }

  const readAppended = async (entry: WatchEntry): Promise<string | null> => {
    const size = await statSize(entry.target.transcriptPath)
    if (size === null) {
      return null
    }
    if (entry.offset === null || size < entry.offset) {
      // First look, or the file was replaced: start from its current end.
      entry.offset = size
      entry.skipPartialLine = false
      return null
    }
    if (size === entry.offset) {
      return null
    }
    let start = entry.offset
    if (size - start > MAX_READ_BYTES) {
      start = size - MAX_READ_BYTES
      entry.skipPartialLine = true
    }
    let bytes = await readRange(entry.target.transcriptPath, start, size - start)
    if (entry.skipPartialLine) {
      const firstNewline = bytes.indexOf(NEWLINE)
      if (firstNewline === -1) {
        entry.offset = start + bytes.length
        return null
      }
      entry.skipPartialLine = false
      start += firstNewline + 1
      bytes = bytes.subarray(firstNewline + 1)
    }
    const lastNewline = bytes.lastIndexOf(NEWLINE)
    if (lastNewline === -1) {
      // Wait for the line to finish unless it alone fills a read; then skip past it.
      if (bytes.length >= MAX_READ_BYTES) {
        entry.offset = start + bytes.length
        entry.skipPartialLine = true
      } else {
        entry.offset = start
      }
      return null
    }
    entry.offset = start + lastNewline + 1
    // Decode whole lines only so a multi-byte character is never split.
    return bytes.subarray(0, lastNewline).toString('utf8')
  }

  const pollEntry = async (paneKey: string, entry: WatchEntry): Promise<void> => {
    if (entry.busy) {
      return
    }
    entry.busy = true
    try {
      const text = await readAppended(entry)
      if (!text || entries.get(paneKey) !== entry) {
        return
      }
      const title = latestClaudeCustomTitle(text, entry.target.sessionId)
      if (!title || title === entry.lastTitle) {
        return
      }
      entry.lastTitle = title
      deps.onTitle({ paneKey, sessionId: entry.target.sessionId, title })
    } catch {
      // An unreadable transcript only means no live rename; the AI vault refresh still catches up.
    } finally {
      entry.busy = false
    }
  }

  const poll = async (): Promise<void> => {
    await Promise.all(Array.from(entries, ([paneKey, entry]) => pollEntry(paneKey, entry)))
  }

  return {
    reconcile,
    poll,
    stop: () => {
      entries.clear()
      syncTimer()
    },
    watchedPaneKeys: () => [...entries.keys()]
  }
}
