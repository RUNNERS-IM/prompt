import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react'
import { flushSync } from 'react-dom'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from '@/lib/close-all-context-menus'

/** True while a dropdown menu whose trigger sits inside `root` is open. */
export function hasOpenMenuInside(root: Element | null): boolean {
  return Boolean(root?.querySelector('[aria-haspopup="menu"][data-state="open"]'))
}

export function TabHoverCard({
  children,
  title,
  icon,
  programName,
  description,
  details,
  side = 'bottom',
  alert,
  closeOnMenuOpen = false
}: {
  children: ReactNode
  title: string
  icon: ReactNode
  programName: string
  description?: string
  /** Prompt: session summary (model, status, task, folder) under the program row. */
  details?: ReactNode
  side?: 'bottom' | 'right'
  /** Controls below the program row; the card then stays open under the pointer. */
  alert?: ReactNode | ((dismiss: () => void) => ReactNode)
  /**
   * Close when a right-click menu opens (CLOSE_ALL_CONTEXT_MENUS_EVENT) and stay closed while a
   * menu inside the trigger is open, so the card never covers the menu it sits next to.
   */
  closeOnMenuOpen?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!closeOnMenuOpen || !open) {
      return
    }
    const close = (): void => setOpen(false)
    window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, close)
    return () => window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, close)
  }, [closeOnMenuOpen, open])
  const handleOpenChange = (next: boolean): void => {
    // Why: rows stop pointerdown, so Radix cannot close the card itself, and its dwell timer
    // may still fire after the menu has opened.
    if (next && closeOnMenuOpen && hasOpenMenuInside(triggerRef.current)) {
      return
    }
    setOpen(next)
  }
  // Remove the portal before navigation can start rendering a slower destination.
  const dismiss = () => flushSync(() => setOpen(false))
  const interactive = alert !== undefined && alert !== null
  return (
    <Tooltip open={open} onOpenChange={handleOpenChange} disableHoverableContent={!interactive}>
      <TooltipTrigger
        ref={triggerRef}
        asChild
        onFocus={(event) => {
          // Nested controls own their focus hints.
          if (event.target !== event.currentTarget) {
            event.preventDefault()
          }
        }}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent
        variant={interactive ? 'tab-preview-interactive' : 'tab-preview'}
        showArrow={false}
        side={side}
        align="start"
        sideOffset={side === 'right' ? 6 : 0}
        data-tab-hover-card="true"
        // Why: React bubbles portal events to the tab strip, whose handlers would act on the tab.
        onContextMenu={stopTabStripEvent}
        onPointerDown={stopTabStripEvent}
        onMouseDown={stopTabStripEvent}
        onClick={stopTabStripEvent}
        onDoubleClick={stopTabStripEvent}
      >
        <div className="space-y-2 text-left">
          <div className="space-y-1">
            <div className="break-words font-medium" data-tab-hover-card-title>
              {title}
            </div>
            {description && <div className="break-all text-muted-foreground">{description}</div>}
          </div>
          <div
            className="flex items-center gap-2 text-muted-foreground"
            data-tab-hover-card-program
          >
            <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden>
              {icon}
            </span>
            <span className="min-w-0 break-all">{programName}</span>
          </div>
          {details}
          {typeof alert === 'function' ? alert(dismiss) : alert}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

function stopTabStripEvent(event: SyntheticEvent): void {
  event.stopPropagation()
}
