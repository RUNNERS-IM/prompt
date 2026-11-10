import { ipcRenderer } from 'electron'
import {
  PROMPT_DECISION_INBOX_CHANGED_CHANNEL,
  PROMPT_DECISION_INBOX_LIST_CHANNEL,
  type PromptDecisionDraft,
  type PromptDecisionInboxApi
} from '../../shared/prompt-decision-inbox'

export const promptDecisionInboxApi = {
  list: (): Promise<PromptDecisionDraft[]> =>
    ipcRenderer.invoke(PROMPT_DECISION_INBOX_LIST_CHANNEL),
  onChanged: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(PROMPT_DECISION_INBOX_CHANGED_CHANNEL, listener)
    return () => ipcRenderer.removeListener(PROMPT_DECISION_INBOX_CHANGED_CHANNEL, listener)
  }
} satisfies PromptDecisionInboxApi
