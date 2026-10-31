// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from '@/lib/close-all-context-menus'
import { TabHoverCard } from './TabHoverCard'
import { TAB_TOOLTIP_DELAY_MS, TabStripTooltipProvider } from './TabStripTooltipProvider'

function renderRow({
  closeOnMenuOpen,
  menuState = 'closed'
}: {
  closeOnMenuOpen: boolean
  menuState?: 'open' | 'closed'
}): void {
  render(
    <TabStripTooltipProvider>
      <TabHoverCard
        title="Session card"
        icon={<span />}
        programName="Claude"
        closeOnMenuOpen={closeOnMenuOpen}
      >
        <div data-testid="row">
          row
          <button aria-hidden tabIndex={-1} aria-haspopup="menu" data-state={menuState} />
        </div>
      </TabHoverCard>
    </TabStripTooltipProvider>
  )
}

function hoverRow(): void {
  fireEvent.pointerMove(screen.getByTestId('row'), { pointerType: 'mouse' })
}

function advance(ms: number): void {
  act(() => vi.advanceTimersByTime(ms))
}

function cardShown(): boolean {
  return screen.queryAllByText('Session card').length > 0
}

describe('TabHoverCard closeOnMenuOpen', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('closes the open card when a right-click menu opens', () => {
    renderRow({ closeOnMenuOpen: true })
    hoverRow()
    advance(TAB_TOOLTIP_DELAY_MS)
    expect(cardShown()).toBe(true)
    act(() => {
      window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
    })
    expect(cardShown()).toBe(false)
  })

  it('does not open while a menu inside the row is open', () => {
    renderRow({ closeOnMenuOpen: true, menuState: 'open' })
    hoverRow()
    advance(TAB_TOOLTIP_DELAY_MS)
    expect(cardShown()).toBe(false)
  })

  it('leaves other cards as they were', () => {
    renderRow({ closeOnMenuOpen: false, menuState: 'open' })
    hoverRow()
    advance(TAB_TOOLTIP_DELAY_MS)
    expect(cardShown()).toBe(true)
    act(() => {
      window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
    })
    expect(cardShown()).toBe(true)
  })
})
