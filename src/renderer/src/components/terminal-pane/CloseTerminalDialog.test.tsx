// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CloseTerminalDialog from './CloseTerminalDialog'
import { translate } from '@/i18n/i18n'

vi.mock('@/i18n/i18n', () => ({
  translate: vi.fn((_key: string, fallback: string, options?: Record<string, string>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => options?.[name] ?? '')
  )
}))

const mountedRoots: Root[] = []

async function renderDialog(props: {
  copyKind?: 'command' | 'agent' | 'chat-agent'
  tabLabel?: string
  onConfirm: (dontAskAgain: boolean) => void
  onCancel?: () => void
}): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push(root)

  await act(async () => {
    root.render(
      <CloseTerminalDialog
        open
        copyKind={props.copyKind}
        tabLabel={props.tabLabel}
        onCancel={props.onCancel ?? vi.fn()}
        onConfirm={props.onConfirm}
      />
    )
  })
}

function clickButton(label: string): void {
  const button = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent === label
  )
  if (!button) {
    throw new Error(`Button not found: ${label}`)
  }
  button.click()
}

describe('CloseTerminalDialog', () => {
  afterEach(async () => {
    await act(async () => {
      for (const root of mountedRoots.splice(0)) {
        root.unmount()
      }
    })
    document.body.innerHTML = ''
  })

  it('does no dialog-copy work while closed, then builds the opened confirmation', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    mountedRoots.push(root)
    const props = { onCancel: vi.fn(), onConfirm: vi.fn() }
    vi.mocked(translate).mockClear()

    await act(async () => root.render(<CloseTerminalDialog open={false} {...props} />))
    expect(translate).not.toHaveBeenCalled()

    await act(async () => root.render(<CloseTerminalDialog open {...props} />))
    expect(document.body.textContent).toContain('Close this session?')
    expect(translate).toHaveBeenCalled()
  })

  it('renders running command copy and confirms without skipping by default', async () => {
    const onConfirm = vi.fn()

    await renderDialog({ copyKind: 'command', tabLabel: 'build', onConfirm })

    expect(document.body.textContent).toContain("Close 'build'?")
    expect(document.body.textContent).toContain('The command running in it will stop.')

    await act(async () => {
      clickButton('Close')
    })

    expect(onConfirm).toHaveBeenCalledWith(false)
  })

  it.each(['agent', 'chat-agent'] as const)(
    'renders the same %s copy and passes the skip preference when checked',
    async (copyKind) => {
      const onConfirm = vi.fn()

      await renderDialog({ copyKind, tabLabel: 'Fix login', onConfirm })

      const text = document.body.textContent ?? ''
      expect(text).toContain("Close 'Fix login'?")
      expect(text).toContain(
        'Its work will stop. The conversation is kept, so you can pick it up later.'
      )
      expect(text).toContain("Don't ask again")
      expect(text).not.toMatch(/sleep|agent|terminals/i)

      const checkbox = document.body.querySelector<HTMLButtonElement>('[role="checkbox"]')
      expect(checkbox?.getAttribute('aria-checked')).toBe('false')

      await act(async () => {
        checkbox?.click()
      })
      await act(async () => {
        clickButton('Close')
      })

      expect(onConfirm).toHaveBeenCalledWith(true)
    }
  )

  it('resets the skip preference when the dialog closes and reopens', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    mountedRoots.push(root)
    const render = async (open: boolean): Promise<void> => {
      await act(async () => {
        root.render(<CloseTerminalDialog open={open} onCancel={onCancel} onConfirm={onConfirm} />)
      })
    }

    await render(true)
    const checkbox = document.body.querySelector<HTMLButtonElement>('[role="checkbox"]')
    await act(async () => {
      checkbox?.click()
    })
    expect(checkbox?.getAttribute('aria-checked')).toBe('true')

    await render(false)
    await render(true)

    expect(document.body.querySelector('[role="checkbox"]')?.getAttribute('aria-checked')).toBe(
      'false'
    )
  })
})
