import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import type {
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
  if (res.status === 400 || res.status === 401 || res.status === 404) {
    throw new ServerProblem('bad')
  }
  if (res.status === 409) {
    throw new ServerProblem('exists')
  }
  if (!res.ok) {
    throw new ServerProblem('network')
  }
  const answer: unknown = await res.json().catch(() => null)
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

/** Signs in, or makes the account first. The password goes as typed over HTTPS, as runners-app-kit sends it. */
export async function signInRunnersAccount(
  mode: PromptRunnersSignMode,
  address: string,
  password: string
): Promise<PromptRunnersSignInResult> {
  const email = address.trim()
  try {
    const tokens = readTokens(
      await post(`/api/mobile/auth/${mode}`, { email, password, projectName: PROJECT })
    )
    if (!tokens) {
      return { ok: false, problem: 'network' }
    }
    file().save({ email, tokens })
    return { ok: true, email }
  } catch (error) {
    return { ok: false, problem: error instanceof ServerProblem ? error.problem : 'network' }
  }
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
