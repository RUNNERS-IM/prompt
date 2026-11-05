import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export type RunnersAccountTokens = { accessToken: string; refreshToken: string }
export type RunnersAccountSaved = { email: string; tokens: RunnersAccountTokens }

export type RunnersAccountFileOptions = {
  path: string
  /** Packaged builds encrypt with the OS keychain (safeStorage); dev runs pass plain text through. */
  seal: (text: string) => Buffer
  unseal: (data: Buffer) => string
}

function isSaved(value: unknown): value is RunnersAccountSaved {
  if (!value || typeof value !== 'object' || !('email' in value) || !('tokens' in value)) {
    return false
  }
  const { email, tokens } = value
  return (
    typeof email === 'string' &&
    !!tokens &&
    typeof tokens === 'object' &&
    'accessToken' in tokens &&
    typeof tokens.accessToken === 'string' &&
    'refreshToken' in tokens &&
    typeof tokens.refreshToken === 'string'
  )
}

/** The one file that holds the signed-in email and its two tokens, and nothing else. */
export function createRunnersAccountFile(options: RunnersAccountFileOptions): {
  load: () => RunnersAccountSaved | null
  save: (next: RunnersAccountSaved | null) => void
} {
  let cached: RunnersAccountSaved | null | undefined

  const load = (): RunnersAccountSaved | null => {
    if (cached !== undefined) {
      return cached
    }
    cached = null
    try {
      if (existsSync(options.path)) {
        const parsed: unknown = JSON.parse(options.unseal(readFileSync(options.path)))
        cached = isSaved(parsed) ? parsed : null
      }
    } catch {
      // Why: a file the OS can no longer decrypt (another user, a reset keychain) reads as signed out.
      cached = null
    }
    return cached
  }

  const save = (next: RunnersAccountSaved | null): void => {
    cached = next
    if (!next) {
      rmSync(options.path, { force: true })
      return
    }
    try {
      mkdirSync(dirname(options.path), { recursive: true })
      writeFileSync(options.path, options.seal(JSON.stringify(next)), { mode: 0o600 })
    } catch {
      // Why: with no OS keychain (some Linux desktops) the tokens stay in memory until quit, never on disk in clear.
      rmSync(options.path, { force: true })
    }
  }

  return { load, save }
}
