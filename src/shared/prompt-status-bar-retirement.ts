import type { PersistedUIState } from './persisted-ui-state-types'
import { PROMPT_BLOCK_UPSTREAM_SERVICES } from './prompt-upstream'

// Prompt hides the bottom status bar once for existing profiles; View > Status Bar still brings it back.
export function promptStatusBarRetirementFields(
  ui: Partial<PersistedUIState> | undefined
): Pick<PersistedUIState, 'statusBarVisible' | '_promptStatusBarRetired'> | null {
  if (!PROMPT_BLOCK_UPSTREAM_SERVICES || ui?._promptStatusBarRetired === true) {
    return null
  }
  return { statusBarVisible: false, _promptStatusBarRetired: true }
}
