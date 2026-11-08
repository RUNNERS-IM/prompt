import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import type {
  PromptRunnersCodePurpose,
  PromptRunnersSendCodeResult,
  PromptRunnersSignInProblem,
  PromptRunnersSignInResult,
  PromptRunnersSignMode
} from '../../shared/prompt-runners-account'
import { createRunnersAccountFile, type RunnersAccountTokens } from './prompt-runners-account-file'

// Login goes to the system server's app login (`/api/mobile/auth/*`), the same one Remote and the phone apps use,
// with Prompt's project name so the server knows which app signed in.
const PROJECT = 'PROMPT'
const TIMEOUT_MS = 15_000
const DEV = !app.isPackaged

/** Debug runs may point at a local test server with PROMPT_RUNNERS_API_URL; packaged apps use the real one. */
const API_URL = (DEV && process.env.PROMPT_RUNNERS_API_URL) || 'https://server.system.runners.im'

let accountFile: ReturnType<typeof createRunnersAccountFile> | null = null

// Why plain text in debug runs: the unsigned dev Electron could be stopped by a keychain prompt nobody answers.
function file(): ReturnType<typeof createRunnersAccountFile> {
  accountFile ??= createRunnersAccountFile({
    path: join(app.getPath('userData'), 'runners-account.bin'),
    seal: (text) => {
      if (DEV) {
        return Buffer.from(text)
      }
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('no keychain')
      }
      return safeStorage.encryptString(text)
    },
    unseal: (data) => (DEV ? data.toString('utf8') : safeStorage.decryptString(data))
  })
  return accountFile
}

class ServerProblem extends Error {
  constructor(readonly problem: PromptRunnersSignInProblem) {
    super(problem)
  }
}

// Same codes as runners-app-kit main/account.ts accountProblem, so the four apps show the same reasons.
const PROBLEM_BY_STATUS: Record<number, PromptRunnersSignInProblem> = {
  400: 'format',
  401: 'bad',
  404: 'none',
  409: 'exists',
  422: 'code',
  429: 'many'
}

async function post(path: string, body: unknown): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch {
    throw new ServerProblem('network')
  }
  const text = await res.text().catch(() => '')
  if (!res.ok) {
    // Why: the server answers an unknown email at login as 401 'User not found', not 404.
    const problem =
      res.status === 401 && text.includes('User not found')
        ? 'none'
        : (PROBLEM_BY_STATUS[res.status] ?? 'network')
    throw new ServerProblem(problem)
  }
  let answer: unknown = null
  try {
    answer = text ? JSON.parse(text) : null
  } catch {
    answer = null
  }
  // Why: the system server wraps a success as {code, data}; a local test server may answer bare.
  return answer && typeof answer === 'object' && 'code' in answer && 'data' in answer
    ? answer.data
    : answer
}

function readTokens(answer: unknown): RunnersAccountTokens | null {
  if (!answer || typeof answer !== 'object' || !('tokens' in answer)) {
    return null
  }
  const { tokens } = answer
  if (
    tokens &&
    typeof tokens === 'object' &&
    'accessToken' in tokens &&
    typeof tokens.accessToken === 'string' &&
    'refreshToken' in tokens &&
    typeof tokens.refreshToken === 'string'
  ) {
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
  }
  return null
}

export function runnersAccountEmail(): string | null {
  return file().load()?.email ?? null
}

export function runnersAccountAccessToken(): string | null {
  return file().load()?.tokens.accessToken ?? null
}

function problemOf(error: unknown): PromptRunnersSignInProblem {
  return error instanceof ServerProblem ? error.problem : 'network'
}

async function signInWith(
  path: string,
  email: string,
  body: Record<string, unknown>
): Promise<PromptRunnersSignInResult> {
  try {
    const tokens = readTokens(await post(path, { email, projectName: PROJECT, ...body }))
    if (!tokens) {
      return { ok: false, problem: 'network' }
    }
    file().save({ email, tokens })
    return { ok: true, email }
  } catch (error) {
    return { ok: false, problem: problemOf(error) }
  }
}

/** Signs in, or makes the account first with the mailed code. The password goes as typed over HTTPS, as
 *  runners-app-kit sends it. */
export function signInRunnersAccount(
  mode: PromptRunnersSignMode,
  address: string,
  password: string,
  code?: string
): Promise<PromptRunnersSignInResult> {
  return signInWith(`/api/mobile/auth/${mode}`, address.trim(), {
    password,
    ...(code ? { code } : {})
  })
}

/** Mails the six-digit code: for a new account (a taken email is 'exists') or a new password (no account is 'none'). */
export async function sendRunnersAccountCode(
  purpose: PromptRunnersCodePurpose,
  address: string,
  locale: string
): Promise<PromptRunnersSendCodeResult> {
  try {
    await post(
      purpose === 'signup' ? '/api/mobile/auth/email-code' : '/api/mobile/auth/password-reset',
      { email: address.trim(), projectName: PROJECT, locale }
    )
    return { ok: true }
  } catch (error) {
    return { ok: false, problem: problemOf(error) }
  }
}

/** Sets a new password with the mailed code and signs in; the four apps share the one password. */
export function resetRunnersAccountPassword(
  address: string,
  code: string,
  password: string
): Promise<PromptRunnersSignInResult> {
  return signInWith('/api/mobile/auth/password-reset/confirm', address.trim(), { code, password })
}

/** Forgets the account here at once; telling the server is best effort so an offline Mac can still sign out. */
export async function signOutRunnersAccount(): Promise<void> {
  const now = file().load()
  file().save(null)
  if (now) {
    await post('/api/mobile/auth/logout', { refreshToken: now.tokens.refreshToken }).catch(
      () => undefined
    )
  }
}
