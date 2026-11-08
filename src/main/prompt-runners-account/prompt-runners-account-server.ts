import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import type {
  PromptRunnersCodePurpose,
  PromptRunnersSendCodeResult,
  PromptRunnersSignInProblem,
  PromptRunnersSignInResult,
  PromptRunnersSignMode
} from '../../shared/prompt-runners-account'
import { createAccount, type Account } from '../runners-app-kit/account'

/** Debug runs may point at a local test server with PROMPT_RUNNERS_API_URL; packaged apps use the real one. */
const API_URL =
  (!app.isPackaged && process.env.PROMPT_RUNNERS_API_URL) || 'https://server.system.runners.im'

const SIGN_IN_PROBLEMS: readonly PromptRunnersSignInProblem[] = [
  'format',
  'bad',
  'none',
  'exists',
  'code',
  'many'
]

let account: Account | null = null

function runnersAccount(): Account {
  account ??= createAccount({
    project: 'PROMPT',
    filePath: join(app.getPath('userData'), 'runners-account.bin'),
    apiUrl: API_URL,
    safeStorage,
    isPackaged: app.isPackaged,
    userAgent: `Prompt/${app.getVersion()}`
  })
  return account
}

function problemOf(error: unknown): PromptRunnersSignInProblem {
  const code = error instanceof Error ? error.message : ''
  return SIGN_IN_PROBLEMS.find((problem) => problem === code) ?? 'network'
}

export function runnersAccountEmail(): string | null {
  return runnersAccount().current()
}

export function runnersAccountAccessToken(): string | null {
  return runnersAccount().accessToken()
}

async function signInWith(
  run: (signIn: Account) => Promise<void>
): Promise<PromptRunnersSignInResult> {
  try {
    await run(runnersAccount())
    const email = runnersAccount().current()
    return email ? { ok: true, email } : { ok: false, problem: 'network' }
  } catch (error) {
    return { ok: false, problem: problemOf(error) }
  }
}

/** Signs in, or makes the account first with the mailed code. */
export function signInRunnersAccount(
  mode: PromptRunnersSignMode,
  address: string,
  password: string,
  code?: string
): Promise<PromptRunnersSignInResult> {
  return signInWith((signIn) => signIn.signIn(mode, address, password, code))
}

/** Mails the six-digit code: for a new account (a taken email is 'exists') or a new password (no account is 'none'). */
export async function sendRunnersAccountCode(
  purpose: PromptRunnersCodePurpose,
  address: string,
  locale: string
): Promise<PromptRunnersSendCodeResult> {
  try {
    await runnersAccount().sendCode(purpose, address, locale)
    return { ok: true }
  } catch (error) {
    return { ok: false, problem: problemOf(error) }
  }
}

/** Sets a new password with the mailed code and signs in; the apps share the one password. */
export function resetRunnersAccountPassword(
  address: string,
  code: string,
  password: string
): Promise<PromptRunnersSignInResult> {
  return signInWith((signIn) => signIn.resetPassword(address, code, password))
}

/** Forgets the account here at once; telling the server is best effort so an offline Mac can still sign out. */
export function signOutRunnersAccount(): Promise<void> {
  return runnersAccount().signOut()
}
