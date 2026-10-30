import { PairingOfferSchema, type PairingOffer } from './types'
import { normalizePairingBase64 } from '../../../src/shared/mobile-pairing-base64'
import { PAIRING_INPUT_MAX_CHARACTERS } from '../../../src/shared/mobile-pairing-protocol-limits'
import {
  PROMPT_BLOCK_UPSTREAM_SERVICES,
  startsWithPairingLinkScheme
} from '../../../src/shared/prompt-upstream'

// Keep parsing aligned with src/shared/pairing.ts; use mobile base64 APIs instead of Node Buffer.

export function decodePairingUrl(url: string): PairingOffer | null {
  try {
    const code = extractPairingCodeFromUrl(url)
    if (!code) {
      return null
    }
    return decodePairingBase64(code)
  } catch {
    return null
  }
}

// Share custom-scheme extraction across camera, paste and external deep-link pairing.
export function extractPairingCodeFromUrl(url: string): string | null {
  if (url.length > PAIRING_INPUT_MAX_CHARACTERS) {
    return null
  }
  const trimmed = url.trim()
  // Prompt: desktop writes prompt://pair; orca://pair from older hosts still parses.
  const match = /^(?:prompt|orca):\/\/([^/?#]*)([^?#]*)?/i.exec(trimmed)
  if (!match) {
    return null
  }
  const host = match[1]?.toLowerCase()
  const pathname = match[2] ?? ''
  if (host !== 'pair' || (pathname !== '' && pathname !== '/')) {
    return null
  }

  const rest = trimmed.slice(match[0].length)
  const queryIndex = rest.indexOf('?')
  if (queryIndex !== -1) {
    const query = rest.slice(queryIndex + 1).split('#')[0] ?? ''
    const params = new URLSearchParams(query)
    const code = params.get('code')
    if (code) {
      return code
    }
  }
  const hashIndex = rest.indexOf('#')
  if (hashIndex !== -1) {
    return rest.slice(hashIndex + 1) || null
  }
  return null
}

export function parsePairingCode(input: string): PairingOffer | null {
  if (input.length > PAIRING_INPUT_MAX_CHARACTERS) {
    return null
  }
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }
  try {
    if (startsWithPairingLinkScheme(trimmed)) {
      return decodePairingUrl(trimmed)
    }
    return decodePairingBase64(trimmed)
  } catch {
    return null
  }
}

function decodePairingBase64(base64url: string): PairingOffer {
  // Restore desktop-stripped QR padding for runtimes that reject unpadded atob input.
  const json = atob(normalizePairingBase64(base64url))
  return withoutRelayForPrompt(PairingOfferSchema.parse(JSON.parse(json)))
}

// Prompt: relay runs on Orca's relay.onorca.dev, so pairing keeps only the direct (same network) path.
function withoutRelayForPrompt(offer: PairingOffer): PairingOffer {
  if (!PROMPT_BLOCK_UPSTREAM_SERVICES || !offer.relay) {
    return offer
  }
  const { relay: _relay, ...direct } = offer
  return direct
}
