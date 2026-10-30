import { ipcMain } from 'electron'
import { PROMPT_LOCAL_HOST_NAME_CHANNEL } from '../../shared/prompt-computers'
import { readPromptLocalHostName } from './prompt-local-host-name'
import { setPromptRuntimeShareServer, type PromptRuntimeShareServer } from './prompt-runtime-share'

/** Prompt computer picker: main-process side. One call from runtime startup wires both parts. */
export function registerPromptComputerHandlers(runtimeRpc: PromptRuntimeShareServer): void {
  setPromptRuntimeShareServer(runtimeRpc)
  ipcMain.removeHandler(PROMPT_LOCAL_HOST_NAME_CHANNEL)
  ipcMain.handle(PROMPT_LOCAL_HOST_NAME_CHANNEL, () => readPromptLocalHostName())
}
