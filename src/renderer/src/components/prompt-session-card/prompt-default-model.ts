import { useAppStore } from '@/store'
import { CLAUDE_SESSION_OPTION_CATALOG } from '../../../../shared/agent-session-option-catalog-claude-codex'
import { matchNativeChatCatalogModelId } from '../../../../shared/native-chat/input/native-chat-session-option-state'

/** Model most sessions run when the user has not picked one in Settings > Agents. */
export const PROMPT_FALLBACK_DEFAULT_MODEL_ID = 'opus'

export const PROMPT_DEFAULT_MODEL_CHOICES = CLAUDE_SESSION_OPTION_CATALOG.models

/** The saved default model id, or the fallback when it is unset or no longer in the catalog. */
export function resolvePromptDefaultModelId(saved: string | undefined): string {
  const id = saved?.trim()
  return id && PROMPT_DEFAULT_MODEL_CHOICES.some((model) => model.id === id)
    ? id
    : PROMPT_FALLBACK_DEFAULT_MODEL_ID
}

/**
 * Model label to show next to a tab or sidebar row: empty when the session runs the default
 * model (the common case, so the label would only repeat), else the reported name as-is.
 */
export function promptVisibleModelLabel(reported: string | undefined, defaultId: string): string {
  const model = reported?.trim() ?? ''
  if (!model) {
    return ''
  }
  const id = matchNativeChatCatalogModelId(CLAUDE_SESSION_OPTION_CATALOG, model)
  return id === defaultId ? '' : model
}

export function usePromptDefaultModelId(): string {
  return resolvePromptDefaultModelId(useAppStore((s) => s.settings?.promptDefaultClaudeModel))
}

/** Hook form of promptVisibleModelLabel for row and tab components. */
export function usePromptVisibleModelLabel(reported: string | undefined): string {
  return promptVisibleModelLabel(reported, usePromptDefaultModelId())
}
