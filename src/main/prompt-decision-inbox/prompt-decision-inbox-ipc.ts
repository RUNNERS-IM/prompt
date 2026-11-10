import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import {
  PROMPT_DECISION_INBOX_CHANGED_CHANNEL,
  PROMPT_DECISION_INBOX_LIST_CHANNEL,
  type PromptDecisionDraft
} from '../../shared/prompt-decision-inbox'
import {
  listPromptDecisionDrafts,
  promptDecisionFoldersToRead,
  PromptDecisionFolderWatch
} from './prompt-decision-inbox'

const listeners = new Set<WebContents>()
let folderWatch: PromptDecisionFolderWatch | null = null

function notifyListeners(): void {
  for (const contents of listeners) {
    if (contents.isDestroyed()) {
      listeners.delete(contents)
    } else {
      contents.send(PROMPT_DECISION_INBOX_CHANGED_CHANNEL)
    }
  }
}

async function listForWindow(event: IpcMainInvokeEvent): Promise<PromptDecisionDraft[]> {
  if (event.sender.isDestroyed() || event.sender.getType() !== 'window') {
    return []
  }
  const directories = await promptDecisionFoldersToRead({
    shared: join(homedir(), 'pudding-shared', 'decisions'),
    desktop: app.getPath('desktop')
  })
  listeners.add(event.sender)
  folderWatch ??= new PromptDecisionFolderWatch(notifyListeners)
  folderWatch.ensure(directories)
  return listPromptDecisionDrafts(directories)
}

export function registerPromptDecisionInboxHandlers(): void {
  ipcMain.removeHandler(PROMPT_DECISION_INBOX_LIST_CHANNEL)
  ipcMain.handle(PROMPT_DECISION_INBOX_LIST_CHANNEL, listForWindow)
}
