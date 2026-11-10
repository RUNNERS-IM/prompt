/** Prompt: the app menu's About item opens Settings on the About tab. Absent on web clients. */
export type PromptAboutSettingsEventApi = {
  onOpenAboutSettings?: (callback: () => void) => () => void
  consumePendingOpenAboutSettings?: () => Promise<boolean>
}
