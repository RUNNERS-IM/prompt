import type { toast as sonnerToast } from 'sonner'
import { applyPromptBrand } from '../../../shared/prompt-brand'

type ToastApi = typeof sonnerToast

// The base toast('…') call cannot be wrapped (it is the exported function itself), so only these
// methods carry the brand. Errors reach users through toast.error, which is the case that matters.
const BRANDED_METHODS = ['success', 'info', 'warning', 'error', 'message', 'loading'] as const

const installed = new WeakSet<object>()

function brandToastData(data: unknown): unknown {
  if (data !== null && typeof data === 'object' && 'description' in data) {
    const { description } = data as { description?: unknown }
    if (typeof description === 'string') {
      return { ...data, description: applyPromptBrand(description) }
    }
  }
  return data
}

/**
 * Swap "Orca" for "Prompt" in toast text that never went through translations, mostly
 * `error.message` strings from upstream main-process code shown as-is. Translated text already
 * went through the same rules (promptBrandPostProcessor), so applying them twice changes nothing.
 * React nodes are left alone. Installed once, from the app's Toaster module.
 */
export function installPromptBrandToasts(api: ToastApi): void {
  if (installed.has(api)) {
    return
  }
  installed.add(api)
  for (const name of BRANDED_METHODS) {
    const original = api[name] as unknown
    // Test spies (vi.fn, which carry .mock) stay as they are so call assertions keep working.
    if (typeof original !== 'function' || 'mock' in original) {
      continue
    }
    const call = original as (message: unknown, data?: unknown) => unknown
    const branded = (message: unknown, data?: unknown): unknown =>
      call(typeof message === 'string' ? applyPromptBrand(message) : message, brandToastData(data))
    try {
      ;(api as unknown as Record<string, unknown>)[name] = branded
    } catch {
      // A frozen test double; leave it as it is.
    }
  }
}
