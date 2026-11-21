import { app, BrowserWindow, safeStorage } from 'electron'
import { join } from 'node:path'
import {
  PROMPT_RUNNERS_ACCOUNT_CHANGED_CHANNEL,
  PROMPT_RUNNERS_NICKNAME_MAX,
  type PromptRunnersCodePurpose,
  type PromptRunnersProfile,
  type PromptRunnersSendCodeResult,
  type PromptRunnersSetNicknameResult,
  type PromptRunnersSignInProblem,
  type PromptRunnersSignInResult,
  type PromptRunnersSignMode
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
let profileLoaded = false
let subscribed = false

function tellWindows(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(PROMPT_RUNNERS_ACCOUNT_CHANGED_CHANNEL)
    }
  }
}

function runnersAccount(): Account {
  account ??= createAccount({
    project: 'PROMPT',
    filePath: join(app.getPath('userData'), 'runners-account.bin'),
    apiUrl: API_URL,
    safeStorage,
    isPackaged: app.isPackaged,
    userAgent: `Prompt/${app.getVersion()}`
  })
  if (!subscribed) {
    subscribed = true
    // Sign-in, sign-out and a nickname answered by the server all land here.
    account.onChange(tellWindows)
  }
  return account
}

function problemOf(error: unknown): PromptRunnersSignInProblem {
  const code = error instanceof Error ? error.message : ''
  return SIGN_IN_PROBLEMS.find((problem) => problem === code) ?? 'network'
}

export function runnersAccountEmail(): string | null {
  return runnersAccount().current()
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

function currentProfile(): PromptRunnersProfile {
  const signedIn = runnersAccount()
  return {
    email: signedIn.current(),
    nickname: signedIn.nickname(),
    custom: signedIn.customNickname()
  }
}

/** The account with its nickname. The first call this run also asks the server, so a nickname set in another
 *  RUNNERS app shows here; the answer arrives through the changed event. */
export function runnersAccountProfile(): PromptRunnersProfile {
  const signedIn = runnersAccount()
  if (!profileLoaded && signedIn.current()) {
    profileLoaded = true
    void signedIn.loadProfile()
  }
  return currentProfile()
}

/** Saves the nickname on the account server; empty goes back to the email's part before @. */
export async function setRunnersAccountNickname(
  name: string
): Promise<PromptRunnersSetNicknameResult> {
  if (name.trim().length > PROMPT_RUNNERS_NICKNAME_MAX) {
    return { ok: false, problem: 'format' }
  }
  try {
    await runnersAccount().setNickname(name)
    return { ok: true, profile: currentProfile() }
  } catch (error) {
    return { ok: false, problem: problemOf(error) === 'format' ? 'format' : 'network' }
  }
}
