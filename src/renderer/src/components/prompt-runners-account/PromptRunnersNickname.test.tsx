// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  PromptRunnersAccountApi,
  PromptRunnersProfile
} from '../../../../shared/prompt-runners-account'
import { PromptRunnersNickname } from './PromptRunnersNickname'
import { getRunnersAccountProfile } from './prompt-runners-account-profile'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const profile: PromptRunnersProfile = { email: 'sun@example.com', nickname: 'sun', custom: false }

function makeApi(setNickname: PromptRunnersAccountApi['setNickname']): PromptRunnersAccountApi {
  return {
    get: vi.fn(),
    signIn: vi.fn(),
    sendCode: vi.fn(),
    resetPassword: vi.fn(),
    signOut: vi.fn(),
    profile: vi.fn(),
    setNickname,
    onChanged: vi.fn(() => () => {})
  }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function field(): HTMLInputElement {
  return container.querySelector('[data-prompt-runners-nickname]') as HTMLInputElement
}

function saveButton(): HTMLButtonElement {
  return container.querySelector('button') as HTMLButtonElement
}

function type(value: string): void {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  act(() => {
    setValue?.call(field(), value)
    field().dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('PromptRunnersNickname', () => {
  it('leaves the field empty with the email part as its hint until a nickname is set', () => {
    act(() => root.render(<PromptRunnersNickname api={makeApi(vi.fn())} profile={profile} />))
    expect(field().value).toBe('')
    expect(field().placeholder).toBe('sun')
    expect(saveButton().disabled).toBe(true)
  })

  it('saves the typed nickname and shares the answer with the panda button', async () => {
    const saved = { ...profile, nickname: 'Sunny', custom: true }
    const setNickname = vi.fn(async () => ({ ok: true as const, profile: saved }))
    act(() => root.render(<PromptRunnersNickname api={makeApi(setNickname)} profile={profile} />))
    type('Sunny')
    await act(async () => saveButton().click())
    expect(setNickname).toHaveBeenCalledWith('Sunny')
    expect(getRunnersAccountProfile()).toEqual(saved)
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('keeps Save on past 30 characters and says so in red instead of calling the server', async () => {
    const setNickname = vi.fn()
    act(() => root.render(<PromptRunnersNickname api={makeApi(setNickname)} profile={profile} />))
    type('a'.repeat(31))
    expect(saveButton().disabled).toBe(false)
    await act(async () => saveButton().click())
    expect(setNickname).not.toHaveBeenCalled()
    const note = container.querySelector('[role="alert"]')
    expect(note?.className).toContain('prompt-runners-nickname-note')
    expect(note?.textContent).toContain('30')
  })

  it('says the server could not be reached when saving fails', async () => {
    const setNickname = vi.fn(async () => ({ ok: false as const, problem: 'network' as const }))
    act(() => root.render(<PromptRunnersNickname api={makeApi(setNickname)} profile={profile} />))
    type('Sunny')
    await act(async () => saveButton().click())
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/server|서버/i)
  })
})
