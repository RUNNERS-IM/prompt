import type {
  PromptRunnersAccountApi,
  PromptRunnersProfile
} from '../../../../shared/prompt-runners-account'

// One copy of the signed-in account for every account button: each open workspace keeps its own tab strip mounted.

const SIGNED_OUT: PromptRunnersProfile = { email: null, nickname: null, custom: false }

/** undefined until main has answered, so the button does not flash Log In for a signed-in account. */
let profile: PromptRunnersProfile | undefined
let loading = false
let watching = false
const listeners = new Set<() => void>()

export function subscribeRunnersAccountProfile(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getRunnersAccountProfile(): PromptRunnersProfile | undefined {
  return profile
}

export function setRunnersAccountProfile(next: PromptRunnersProfile | null): void {
  profile = next ?? SIGNED_OUT
  for (const listener of listeners) {
    listener()
  }
}

function readProfile(api: PromptRunnersAccountApi): void {
  void api.profile().then(setRunnersAccountProfile, () => {
    if (profile === undefined) {
      setRunnersAccountProfile(null)
    }
  })
}

/** Reads the account once, then again whenever main says it or its nickname changed (here or in another app). */
export function loadRunnersAccountProfile(api: PromptRunnersAccountApi): void {
  if (!watching) {
    watching = true
    api.onChanged(() => readProfile(api))
  }
  if (loading || profile !== undefined) {
    return
  }
  loading = true
  void api
    .profile()
    .then(setRunnersAccountProfile, () => setRunnersAccountProfile(null))
    .finally(() => {
      loading = false
    })
}

/** Right after signing in, before main's answer: the email, with its part before @ as the name. */
export function signedInRunnersAccountProfile(email: string): PromptRunnersProfile {
  return { email, nickname: email.split('@')[0] ?? email, custom: false }
}
