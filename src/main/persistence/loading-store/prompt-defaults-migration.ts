import type { PersistedState } from '../../../shared/persisted-state-types'

/** Bump when PROMPT_FORCED_DEFAULTS changes so every Mac applies the new list once more. */
export const PROMPT_DEFAULTS_VERSION = 1

type PromptSettings = PersistedState['settings'] & {
  promptDefaultsVersion?: number
}

// Prompt hides these Orca features (see prompt-hidden-settings.ts). New installs already get
// them off from default-global-settings.ts, but a Mac that ran Orca before reads the same
// settings folder and keeps the old values, so they are switched off once on first launch.
// The user can still turn a visible one back on afterwards; the version flag stops a re-run.
export const PROMPT_FORCED_DEFAULTS = {
  showMobileButton: false,
  showTasksButton: false,
  showAutomationsButton: false,
  showArtifactsButton: false,
  showSkillsButton: false,
  floatingTerminalEnabled: false,
  experimentalMobile: false,
  experimentalPet: false,
  experimentalConnectors: false,
  artifactSharingEnabled: false,
  agentSkillSharingEnabled: false,
  pluginSystemEnabled: false,
  pluginSystemDefaultedOn: true
} as const satisfies Partial<PromptSettings>

export function applyPromptDefaultsOnce(
  settings: PersistedState['settings'],
  markNeedsSave: () => void
): PersistedState['settings'] {
  const current: PromptSettings = settings
  if ((current.promptDefaultsVersion ?? 0) >= PROMPT_DEFAULTS_VERSION) {
    return settings
  }
  markNeedsSave()
  const next: PromptSettings = {
    ...current,
    ...PROMPT_FORCED_DEFAULTS,
    // Prompt only runs Claude Code; keep an explicit earlier choice.
    defaultTuiAgent: current.defaultTuiAgent ?? 'claude',
    promptDefaultsVersion: PROMPT_DEFAULTS_VERSION
  }
  return next
}
