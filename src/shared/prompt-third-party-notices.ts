// The About window's "MIT notice" link opens THIRD_PARTY_NOTICES.md, which ships in the app's
// resources folder (electron-builder extraResources), with the system's default app.

export const PROMPT_OPEN_THIRD_PARTY_NOTICES_CHANNEL = 'prompt:openThirdPartyNotices'

export const PROMPT_THIRD_PARTY_NOTICES_FILE = 'THIRD_PARTY_NOTICES.md'

export type PromptThirdPartyNoticesApi = {
  /** Resolves false when the file is missing or no app could open it. */
  open: () => Promise<boolean>
}
