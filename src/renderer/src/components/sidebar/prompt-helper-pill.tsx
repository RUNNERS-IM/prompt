import React, { useCallback } from 'react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

/** Prompt: a session's helper agents fold into one "Helpers N" pill on the parent row; click opens them. */
export function PromptHelperPill({
  count,
  expanded,
  onToggle
}: {
  count: number
  expanded: boolean
  onToggle: () => void
}): React.JSX.Element {
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      onToggle()
    },
    [onToggle]
  )
  const label = translate('prompt.sessionRow.helpers', 'Helpers {{count}}', { count })
  return (
    <button
      type="button"
      className={cn(
        'shrink-0 rounded-full border px-1.5 text-[10px] leading-4 tabular-nums transition-colors',
        expanded
          ? 'border-foreground/30 bg-foreground/10 text-foreground'
          : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
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
      {label}
    </button>
  )
}
