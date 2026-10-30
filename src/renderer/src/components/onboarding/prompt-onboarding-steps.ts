// Prompt only runs Claude Code (selected by default in default-global-settings.ts) and has no
// task-source integrations. The agent step stays, but OnboardingFlow shows only its Yolo mode
// switch there, not the agent picker.
export const PROMPT_SKIPPED_ONBOARDING_STEP_IDS: ReadonlySet<string> = new Set(['integrations'])

export function isPromptSkippedOnboardingStep(stepId: string | undefined): boolean {
  return stepId !== undefined && PROMPT_SKIPPED_ONBOARDING_STEP_IDS.has(stepId)
}
