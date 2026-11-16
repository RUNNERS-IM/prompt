import { BrowserWindow, ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { unwatchFile, watchFile } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  PROMPT_SHARED_LIBRARY_CHANGED_CHANNEL,
  PROMPT_SHARED_LIBRARY_READ_CHANNEL,
  PROMPT_SHARED_LIBRARY_RELATIVE_PATH,
  parseSharedPromptLibrary,
  type SharedPromptItem
} from '../shared/prompt-shared-library'

// 공용 프롬프트 목록 파일을 읽고, git pull 등으로 바뀌면 열린 창에 새 목록을 보낸다.
// 파일은 git 이 지웠다 새로 쓰기도 하므로 fs.watch 대신 몇 초마다 고친 때를 보는 watchFile 을 쓴다.

const POLL_INTERVAL_MS = 5_000

let watchedPath: string | null = null

export function sharedPromptLibraryPath(): string {
  return join(homedir(), ...PROMPT_SHARED_LIBRARY_RELATIVE_PATH)
}

export async function readSharedPromptLibrary(
  path: string = sharedPromptLibraryPath()
): Promise<SharedPromptItem[]> {
  try {
    return parseSharedPromptLibrary(await readFile(path, 'utf8'))
  } catch {
    // 파일이 없는 맥이 대부분이다. 조용히 빈 목록.
    return []
  }
}

function broadcast(items: SharedPromptItem[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue
    }
    try {
      window.webContents.send(PROMPT_SHARED_LIBRARY_CHANGED_CHANNEL, items)
    } catch {
      // A renderer can disappear between isDestroyed() and send().
    }
  }
}

export function registerPromptSharedLibraryHandlers(): void {
  ipcMain.removeHandler(PROMPT_SHARED_LIBRARY_READ_CHANNEL)
  ipcMain.handle(PROMPT_SHARED_LIBRARY_READ_CHANNEL, () => readSharedPromptLibrary())
  const path = sharedPromptLibraryPath()
  if (watchedPath) {
    unwatchFile(watchedPath)
  }
  watchedPath = path
  watchFile(path, { interval: POLL_INTERVAL_MS, persistent: false }, (current, previous) => {
    if (current.mtimeMs === previous.mtimeMs && current.size === previous.size) {
      return
    }
    void readSharedPromptLibrary(path).then(broadcast)
  })
}
