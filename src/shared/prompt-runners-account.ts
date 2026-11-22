// The RUNNERS account in Prompt's desktop window (runners-wiki 「2026-11-05 네 앱 계정 · 연결 통일」 2A): signed
// out, one Log In button at the tab strip's end opens the shared sign-in sheet; signed in, the email's first letter
// badge opens the account menu. Only main talks to the system server and keeps the tokens.

export const PROMPT_RUNNERS_ACCOUNT_GET_CHANNEL = 'prompt:runnersAccountGet'
export const PROMPT_RUNNERS_ACCOUNT_SIGN_IN_CHANNEL = 'prompt:runnersAccountSignIn'
export const PROMPT_RUNNERS_ACCOUNT_SIGN_OUT_CHANNEL = 'prompt:runnersAccountSignOut'
export const PROMPT_RUNNERS_ACCOUNT_SEND_CODE_CHANNEL = 'prompt:runnersAccountSendCode'
export const PROMPT_RUNNERS_ACCOUNT_RESET_PASSWORD_CHANNEL = 'prompt:runnersAccountResetPassword'
export const PROMPT_RUNNERS_ACCOUNT_PROFILE_CHANNEL = 'prompt:runnersAccountProfile'
export const PROMPT_RUNNERS_ACCOUNT_SET_NICKNAME_CHANNEL = 'prompt:runnersAccountSetNickname'
/** Main tells the windows the account or its nickname changed (here, or in another RUNNERS app). */
export const PROMPT_RUNNERS_ACCOUNT_CHANGED_CHANNEL = 'prompt:runnersAccountChanged'

/** The nickname every RUNNERS app shows beside the panda (runners-wiki 2026-11-19 2B), kept on the account server. */
export const PROMPT_RUNNERS_NICKNAME_MAX = 30

export type PromptRunnersProfile = {
  email: string | null
  /** The nickname to show: the one the person set, else the part of the email before @. null while signed out. */
  nickname: string | null
  /** Whether the person set the nickname; if not, the settings field stays empty with the default as its hint. */
  custom: boolean
}

export type PromptRunnersSetNicknameResult =
  | { ok: true; profile: PromptRunnersProfile }
  | { ok: false; problem: 'format' | 'network' }

export type PromptRunnersSignMode = 'login' | 'signup'

/** Why the mailed six-digit code is sent: to make an account, or to set a new password. */
export type PromptRunnersCodePurpose = 'signup' | 'reset'

/** The shared sheet's failure codes (runners-account.tsx SignInProblem): wrong password, no such account, password
 *  shape, taken email, wrong code, too many tries; anything else shows as no server. */
export type PromptRunnersSignInProblem =
  | 'bad'
  | 'none'
  | 'format'
  | 'exists'
  | 'code'
  | 'many'
  | 'network'

export type PromptRunnersSignInResult =
  | { ok: true; email: string }
  | { ok: false; problem: PromptRunnersSignInProblem }

export type PromptRunnersSendCodeResult =
  | { ok: true }
  | { ok: false; problem: PromptRunnersSignInProblem }

export type PromptRunnersAccountApi = {
  /** The signed-in email, or null. */
  get: () => Promise<string | null>
  signIn: (
    mode: PromptRunnersSignMode,
    email: string,
    password: string,
    code?: string
  ) => Promise<PromptRunnersSignInResult>
  sendCode: (
    purpose: PromptRunnersCodePurpose,
    email: string,
    locale: string
  ) => Promise<PromptRunnersSendCodeResult>
  /** Sets a new password with the mailed code and signs in with it. */
  resetPassword: (
    email: string,
    code: string,
    password: string
  ) => Promise<PromptRunnersSignInResult>
  signOut: () => Promise<void>
  /** The account with its nickname; asks the server once for a nickname changed in another app. */
  profile: () => Promise<PromptRunnersProfile>
  /** Empty sets the nickname back to the email's part before @. */
  setNickname: (name: string) => Promise<PromptRunnersSetNicknameResult>
  onChanged: (listener: () => void) => () => void
}
