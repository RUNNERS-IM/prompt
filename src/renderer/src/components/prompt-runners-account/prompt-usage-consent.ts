import type {
  PromptRunnersAccountApi,
  PromptUsageConsent
} from '../../../../shared/prompt-runners-account'

// One copy of the answer for the first-run sheet and the settings row.

/** undefined until main has answered, so neither surface draws a guess. */
let consent: PromptUsageConsent | undefined
let loading = false
const listeners = new Set<() => void>()

export function subscribePromptUsageConsent(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getPromptUsageConsent(): PromptUsageConsent | undefined {
  return consent
}

function publish(next: PromptUsageConsent): void {
  consent = next
  for (const listener of listeners) {
    listener()
  }
}

export function choosePromptUsageConsent(api: PromptRunnersAccountApi, granted: boolean): void {
  publish(granted ? 'granted' : 'denied')
  void api.setUsageConsent(granted)
}

export function loadPromptUsageConsent(api: PromptRunnersAccountApi): void {
  if (loading || consent !== undefined) {
    return
  }
  loading = true
  void api
    .usageConsent()
    .then(publish, () => undefined)
    .finally(() => {
      loading = false
    })
}
