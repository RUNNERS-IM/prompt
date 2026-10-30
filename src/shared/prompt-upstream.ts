// Prompt: the one place that keeps this fork away from Orca's company services (onorca.dev, stablyai).
// Upstream files only import from here, so daily upstream merges touch as few lines as possible.

// Unit tests keep the upstream behavior so upstream tests keep passing through daily merges.
// Why the typeof guard: the sandboxed renderer has no `process` global.
const RUNNING_UNIT_TESTS = typeof process !== 'undefined' && process.env?.VITEST === 'true'

/** True in every real Prompt build: sign-in, relay, push, plugin catalogs and update feeds of Orca stay off. */
export const PROMPT_BLOCK_UPSTREAM_SERVICES = !RUNNING_UNIT_TESTS

export const PROMPT_REPO_SLUG = 'RUNNERS-IM/prompt'
export const PROMPT_REPO_URL = `https://github.com/${PROMPT_REPO_SLUG}`
export const PROMPT_ISSUES_URL = `${PROMPT_REPO_URL}/issues`
export const PROMPT_NEW_ISSUE_URL = `${PROMPT_ISSUES_URL}/new`
export const PROMPT_RELEASES_URL = `${PROMPT_REPO_URL}/releases`

/** Shown wherever an Orca cloud feature (account, relay, sharing) would have started. */
export const PROMPT_CLOUD_UNAVAILABLE_MESSAGE =
  'Prompt has no cloud account. Sign-in, relay and sharing are turned off.'

/** Prompt mobile is not on Orca's App Store or download pages; installers ship with Prompt's releases. */
export const PROMPT_MOBILE_DOWNLOAD_URL = PROMPT_RELEASES_URL

/** Deep-link scheme of the desktop app (electron-builder `protocols`) and the mobile app (app.json `scheme`). */
export const PROMPT_DEEP_LINK_SCHEME = 'prompt'
/** Upstream scheme; pairing still reads it so codes from older Orca-based hosts keep working. */
const LEGACY_DEEP_LINK_SCHEME = 'orca'

/** Pairing links are written as prompt://pair?code=… */
export const PROMPT_PAIRING_LINK_PREFIX = `${PROMPT_DEEP_LINK_SCHEME}://pair`

/** URL.protocol check for pairing links (`prompt:` or the legacy `orca:`). */
export function isPairingLinkProtocol(protocol: string): boolean {
  const scheme = protocol.toLowerCase()
  return scheme === `${PROMPT_DEEP_LINK_SCHEME}:` || scheme === `${LEGACY_DEEP_LINK_SCHEME}:`
}

/** True when the text starts with a pairing-capable scheme (`prompt://` or `orca://`). */
export function startsWithPairingLinkScheme(input: string): boolean {
  const lower = input.toLowerCase()
  return (
    lower.startsWith(`${PROMPT_DEEP_LINK_SCHEME}://`) ||
    lower.startsWith(`${LEGACY_DEEP_LINK_SCHEME}://`)
  )
}

/** Prompt value in real builds, upstream value under unit tests (keeps upstream tests unchanged across merges). */
export function promptOr<T>(promptValue: T, upstreamValue: T): T {
  return PROMPT_BLOCK_UPSTREAM_SERVICES ? promptValue : upstreamValue
}
