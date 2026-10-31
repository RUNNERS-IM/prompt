import { expect, it, vi } from 'vitest'
import type { toast as sonnerToast } from 'sonner'
import { installPromptBrandToasts } from './prompt-brand-toast'

function fakeToastApi() {
  const calls: unknown[][] = []
  const record =
    (type: string) =>
    (...args: unknown[]) => {
      calls.push([type, ...args])
      return 1
    }
  const api = Object.assign(record('default'), {
    success: record('success'),
    info: record('info'),
    warning: record('warning'),
    error: record('error'),
    message: record('message'),
    loading: record('loading')
  })
  return { api: api as unknown as typeof sonnerToast, calls }
}

it('swaps Orca for Prompt in untranslated toast titles and descriptions', () => {
  const { api, calls } = fakeToastApi()
  installPromptBrandToasts(api)
  api.error('Orca could not reach the server', { description: 'Restart Orca and try again.' })
  api.success('Saved')
  expect(calls).toEqual([
    [
      'error',
      'Prompt could not reach the server',
      { description: 'Restart Prompt and try again.' }
    ],
    ['success', 'Saved', undefined]
  ])
})

it('leaves non-string content, identifiers and the orca CLI alone', () => {
  const { api, calls } = fakeToastApi()
  installPromptBrandToasts(api)
  const node = { type: 'span' }
  api.warning(node as never, { description: node as never })
  api.info('Run orca status or set ORCA_HOME')
  expect(calls).toEqual([
    ['warning', node, { description: node }],
    ['info', 'Run orca status or set ORCA_HOME', undefined]
  ])
})

it('installs once and keeps test spies untouched', () => {
  const { api, calls } = fakeToastApi()
  installPromptBrandToasts(api)
  installPromptBrandToasts(api)
  api.error('Orca')
  expect(calls).toEqual([['error', 'Prompt', undefined]])

  const spy = vi.fn()
  const spied = Object.assign(() => 1, { error: spy }) as unknown as typeof sonnerToast
  installPromptBrandToasts(spied)
  expect(spied.error).toBe(spy)
})
