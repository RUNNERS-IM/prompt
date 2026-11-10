import type { PromptRunnersAccountApi } from '../../../../shared/prompt-runners-account'

// One copy of the signed-in email for every account button: each open workspace keeps its own tab strip mounted.

/** undefined until main has answered, so the button does not flash Log In for a signed-in account. */
let email: string | null | undefined
let loading = false
const listeners = new Set<() => void>()

export function subscribeRunnersAccountEmail(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getRunnersAccountEmail(): string | null | undefined {
  return email
}

export function setRunnersAccountEmail(next: string | null): void {
  email = next
  for (const listener of listeners) {
    listener()
  }
}

export function loadRunnersAccountEmail(api: PromptRunnersAccountApi): void {
  if (loading || email !== undefined) {
    return
  }
  loading = true
  void api
    .get()
    .then(setRunnersAccountEmail, () => setRunnersAccountEmail(null))
    .finally(() => {
      loading = false
    })
}
