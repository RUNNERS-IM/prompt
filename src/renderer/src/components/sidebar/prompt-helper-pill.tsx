import React, { useCallback } from 'react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { ChevronDown, ChevronRight } from 'lucide-react'

/** Prompt: a session's helper agents fold into one "Helpers N" toggle on the parent row; click opens them. */
export function PromptHelperPill({
  count,
  expanded,
  onToggle,
  className
}: {
  count: number
  expanded: boolean
  onToggle: () => void
  className?: string
}): React.JSX.Element {
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      onToggle()
    },
    [onToggle]
  )
  const label = translate('prompt.sessionRow.helpers', 'Helpers {{count}}', {
    count
  })
  const Chevron = expanded ? ChevronDown : ChevronRight
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-4 shrink-0 items-center gap-0.5 rounded px-1 align-top text-[10px] leading-4 tabular-nums transition-colors',
        expanded
          ? 'bg-foreground/10 text-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        className
      )}
      aria-expanded={expanded}
      onClick={handleClick}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.stopPropagation()
        }
      }}
      data-prompt-helper-pill=""
    >
      <Chevron className="size-3" />
      {label}
    </button>
  )
}
