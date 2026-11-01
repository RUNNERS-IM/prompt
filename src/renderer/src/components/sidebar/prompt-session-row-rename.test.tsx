/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  setTitle: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign((selector: (s: unknown) => unknown) => selector(mocks.state), {
    getState: () => mocks.state
  })
}))

import {
  PromptSessionRowRename,
  promptRenameOpenValue,
  promptRenameTopicRange
} from './prompt-session-row-rename'

let root: Root | undefined

function renderBox(rowName: string, customTitle?: string): {
  input: HTMLInputElement
  done: ReturnType<typeof vi.fn>
} {
  mocks.state = {
    tabsByWorktree: { 'wt-1': [{ id: 'term-1', customTitle }] },
    setTabCustomTitle: mocks.setTitle
  }
  const done = vi.fn()
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() =>
    root!.render(
      <PromptSessionRowRename tabId="term-1" worktreeId="wt-1" rowName={rowName} onDone={done} />
    )
  )
  return { input: container.querySelector('input')!, done }
}

function type(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function press(input: HTMLInputElement, key: string): void {
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
    cb()
    return 0
  })
})

afterEach(() => {
  act(() => root?.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

describe('promptRenameTopicRange', () => {
  it('selects only the topic after a "[PROJECT] " prefix', () => {
    expect(promptRenameTopicRange('[PROMPT] 사이드바')).toEqual([9, 13])
  })

  it('selects the whole name without a prefix, or with nothing after it', () => {
    expect(promptRenameTopicRange('rename test')).toEqual([0, 11])
    expect(promptRenameTopicRange('[PROMPT] ')).toEqual([0, 9])
    expect(promptRenameTopicRange('')).toEqual([0, 0])
  })
})

describe('promptRenameOpenValue', () => {
  it('opens with the set name, else the row name, and empty for a new session', () => {
    expect(promptRenameOpenValue('[PROMPT] 개발', 'x')).toEqual({
      value: '[PROMPT] 개발',
      isSetName: true
    })
    expect(promptRenameOpenValue('', 'rename test')).toEqual({
      value: 'rename test',
      isSetName: false
    })
    expect(promptRenameOpenValue('', 'New Session')).toEqual({ value: '', isSetName: false })
  })
})

describe('PromptSessionRowRename', () => {
  it('opens on the set name with the topic selected', () => {
    const { input } = renderBox('[PROMPT] 사이드바', '[PROMPT] 사이드바')
    expect(input.value).toBe('[PROMPT] 사이드바')
    expect(document.activeElement).toBe(input)
    expect([input.selectionStart, input.selectionEnd]).toEqual([9, 13])
  })

  it('saves the typed name on Enter', () => {
    const { input, done } = renderBox('[PROMPT] 사이드바', '[PROMPT] 사이드바')
    type(input, '[PROMPT] 개발')
    press(input, 'Enter')
    expect(mocks.setTitle).toHaveBeenCalledWith('term-1', '[PROMPT] 개발')
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('saves nothing on Escape, and nothing more when the box then loses focus', () => {
    const { input, done } = renderBox('[PROMPT] 사이드바', '[PROMPT] 사이드바')
    type(input, '[PROMPT] 개발')
    press(input, 'Escape')
    act(() => input.blur())
    expect(mocks.setTitle).not.toHaveBeenCalled()
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('saves nothing when an unnamed row loses focus untouched', () => {
    const { input, done } = renderBox('rename test')
    act(() => input.blur())
    expect(mocks.setTitle).not.toHaveBeenCalled()
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('clears the set name when the box is emptied', () => {
    const { input } = renderBox('[PROMPT] 사이드바', '[PROMPT] 사이드바')
    type(input, '  ')
    press(input, 'Enter')
    expect(mocks.setTitle).toHaveBeenCalledWith('term-1', null)
  })
})
