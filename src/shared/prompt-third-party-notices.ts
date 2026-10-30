// "Open source notices" in the About window opens a small Prompt window that shows
// THIRD_PARTY_NOTICES.md and can open Chromium's licenses file. The file ships in the app's resources folder (electron-builder
// extraResources) and only main reads it.

export const PROMPT_OPEN_THIRD_PARTY_NOTICES_CHANNEL = 'prompt:openThirdPartyNotices'
export const PROMPT_READ_THIRD_PARTY_NOTICES_CHANNEL = 'prompt:readThirdPartyNotices'
export const PROMPT_OPEN_CHROMIUM_LICENSES_CHANNEL = 'prompt:openChromiumLicenses'

export const PROMPT_THIRD_PARTY_NOTICES_FILE = 'THIRD_PARTY_NOTICES.md'

export type PromptThirdPartyNoticesApi = {
  /** Opens (or focuses) the notices window. */
  open: () => Promise<void>
  /** The notices text, or null when the bundled file cannot be read. */
  read: () => Promise<string | null>
  /** Opens Electron's LICENSES.chromium.html with the default browser; false when it is missing. */
  openChromiumLicenses: () => Promise<boolean>
}
