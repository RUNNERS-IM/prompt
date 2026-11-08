// The RUNNERS account in Prompt's desktop window (runners-wiki 「2026-11-05 네 앱 계정 · 연결 통일」 2A): signed
// out, one Log In button at the tab strip's end opens the shared sign-in sheet; signed in, the email's first letter
// badge opens the account menu. Only main talks to the system server and keeps the tokens.

export const PROMPT_RUNNERS_ACCOUNT_GET_CHANNEL = 'prompt:runnersAccountGet'
export const PROMPT_RUNNERS_ACCOUNT_SIGN_IN_CHANNEL = 'prompt:runnersAccountSignIn'
export const PROMPT_RUNNERS_ACCOUNT_SIGN_OUT_CHANNEL = 'prompt:runnersAccountSignOut'
export const PROMPT_RUNNERS_ACCOUNT_SEND_CODE_CHANNEL = 'prompt:runnersAccountSendCode'
export const PROMPT_RUNNERS_ACCOUNT_RESET_PASSWORD_CHANNEL = 'prompt:runnersAccountResetPassword'
export const PROMPT_USAGE_CONSENT_GET_CHANNEL = 'prompt:usageConsentGet'
export const PROMPT_USAGE_CONSENT_SET_CHANNEL = 'prompt:usageConsentSet'

export type PromptRunnersSignMode = 'login' | 'signup'

export type PromptUsageConsent = 'unasked' | 'granted' | 'denied'

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
  usageConsent: () => Promise<PromptUsageConsent>
  setUsageConsent: (granted: boolean) => Promise<void>
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
}
