// Prompt only runs Claude Code (selected by default in default-global-settings.ts) and has no
// task-source integrations, so first-run setup shows just the theme and notification steps.
export const PROMPT_SKIPPED_ONBOARDING_STEP_IDS: ReadonlySet<string> = new Set([
  'agent',
  'integrations'
])

export function isPromptSkippedOnboardingStep(stepId: string | undefined): boolean {
  return stepId !== undefined && PROMPT_SKIPPED_ONBOARDING_STEP_IDS.has(stepId)
}
