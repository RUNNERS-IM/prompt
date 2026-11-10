import { PROMPT_BLOCK_UPSTREAM_SERVICES } from '../../../../shared/prompt-upstream'
import type { NewTabAgentMenuModel } from './use-new-tab-agent-menu-rows'

// Prompt 의 탭 줄 + 메뉴는 Claude · Terminal 둘만 둔다. 다른 항목의 단축키는 그대로 남는다.
export const PROMPT_TAB_CREATE_MENU_CLAUDE_AND_TERMINAL = PROMPT_BLOCK_UPSTREAM_SERVICES

export function promptTabCreateAgentMenuModel(model: NewTabAgentMenuModel): NewTabAgentMenuModel {
  if (!PROMPT_TAB_CREATE_MENU_CLAUDE_AND_TERMINAL || model.state !== 'settled') {
    return model
  }
  return { ...model, rows: model.rows.filter((row) => row.agent === 'claude') }
}
