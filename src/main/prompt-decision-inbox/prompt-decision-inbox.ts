import { watch, type FSWatcher } from 'node:fs'
import { open, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  parsePromptDecisionFileName,
  type PromptDecisionDraft
} from '../../shared/prompt-decision-inbox'

export type PromptDecisionFolders = { shared: string; desktop: string }

// The choice bar sits just before </body>, and pages can embed many megabytes of screenshots above it.
const CHOICE_BAR_TAIL_BYTES = 32 * 1024
const CHOICE_BAR_MARKER = 'id="choice-bar"'
const CHANGE_DEBOUNCE_MS = 300

async function isDirectory(path: string): Promise<boolean> {
  return stat(path).then(
    (entry) => entry.isDirectory(),
    () => false
  )
}

/** Why gated: reading the desktop raises a macOS permission prompt, which people without the shared folder must never see. */
export async function promptDecisionFoldersToRead(
  folders: PromptDecisionFolders
): Promise<string[]> {
  return (await isDirectory(folders.shared)) ? [folders.shared, folders.desktop] : []
}

async function hasChoiceBar(path: string, size: number): Promise<boolean> {
  const handle = await open(path, 'r')
  try {
    const length = Math.min(size, CHOICE_BAR_TAIL_BYTES)
    const { bytesRead, buffer } = await handle.read(Buffer.alloc(length), 0, length, size - length)
    return buffer.subarray(0, bytesRead).toString('latin1').includes(CHOICE_BAR_MARKER)
  } finally {
    await handle.close()
  }
}

async function readDraft(directory: string, fileName: string): Promise<PromptDecisionDraft | null> {
  const parsed = parsePromptDecisionFileName(fileName)
  if (!parsed) {
    return null
  }
  const filePath = join(directory, fileName)
  try {
    const entry = await stat(filePath)
    if (!entry.isFile() || !(await hasChoiceBar(filePath, entry.size))) {
      return null
    }
    return { filePath, ...parsed, modifiedAt: entry.mtimeMs }
  } catch {
    // A session can delete an answered page between the listing and this read.
    return null
  }
}

/** Newest first; the desktop copy of a page yields to its original earlier in `directories`. */
export async function listPromptDecisionDrafts(
  directories: readonly string[]
): Promise<PromptDecisionDraft[]> {
  const byName = new Map<string, PromptDecisionDraft>()
  for (const directory of directories) {
    const names = await readdir(directory).catch(() => [])
    const drafts = await Promise.all(names.map((name) => readDraft(directory, name)))
    for (const draft of drafts) {
      const key = `${draft?.sessionName}\0${draft?.topic}`
      if (draft && !byName.has(key)) {
        byName.set(key, draft)
      }
    }
  }
  return [...byName.values()].sort((a, b) => b.modifiedAt - a.modifiedAt)
}

export class PromptDecisionFolderWatch {
  private readonly watchers = new Map<string, FSWatcher>()
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly onChange: () => void) {}

  ensure(directories: readonly string[]): void {
    for (const directory of directories) {
      if (this.watchers.has(directory)) {
        continue
      }
      try {
        const watcher = watch(directory, () => this.schedule())
        // Why dropped: a removed folder errors here, and the next listing can watch it again.
        watcher.once('error', () => this.drop(directory))
        this.watchers.set(directory, watcher)
      } catch {
        // The folder vanished after the listing; the next listing retries.
      }
    }
  }

  private drop(directory: string): void {
    this.watchers.get(directory)?.close()
    this.watchers.delete(directory)
    this.schedule()
  }

  private schedule(): void {
    if (this.timer) {
      clearTimeout(this.timer)
    }
    this.timer = setTimeout(() => {
      this.timer = null
      this.onChange()
    }, CHANGE_DEBOUNCE_MS)
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    for (const watcher of this.watchers.values()) {
      watcher.close()
    }
    this.watchers.clear()
  }
}
