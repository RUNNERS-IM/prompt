import { ipcRenderer } from 'electron'
import {
  PROMPT_MENU_PANEL_FIT_HEIGHT_CHANNEL,
  PROMPT_MENU_PANEL_ROWS_CHANNEL,
  PROMPT_MENU_PANEL_RUN_CHANNEL,
  PROMPT_MENU_PANEL_SHOWN_CHANNEL,
  type PromptMenuCommandId,
  type PromptMenuPanelApi,
  type PromptMenuRow
} from '../../shared/prompt-menu-panel'

// 맥 메뉴 막대 패널(src/renderer/prompt-menu-panel.html)이 쓰는 다리. main 은 패널 창이 보낸 것만 받는다.
export const promptMenuPanelApi = {
  rows: (): Promise<PromptMenuRow[]> => ipcRenderer.invoke(PROMPT_MENU_PANEL_ROWS_CHANNEL),
  run: (id: PromptMenuCommandId): Promise<PromptMenuRow[] | null> =>
    ipcRenderer.invoke(PROMPT_MENU_PANEL_RUN_CHANNEL, id),
  fitHeight: (height: number): void =>
    ipcRenderer.send(PROMPT_MENU_PANEL_FIT_HEIGHT_CHANNEL, height),
  onShown: (listener: (rows: PromptMenuRow[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, rows: PromptMenuRow[]): void =>
      listener(rows)
    ipcRenderer.on(PROMPT_MENU_PANEL_SHOWN_CHANNEL, handler)
    return () => {
      ipcRenderer.removeListener(PROMPT_MENU_PANEL_SHOWN_CHANNEL, handler)
    }
  }
} satisfies PromptMenuPanelApi
