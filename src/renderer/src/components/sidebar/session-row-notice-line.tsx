import React from 'react'
import { cn } from '@/lib/utils'

export function SessionRowNoticeLine({
  message,
  actionLabel,
  onAction,
  tone
}: {
  message: string
  actionLabel: string
  onAction: () => void
  tone: 'warning' | 'error'
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-1.5 pl-[17px] text-[10px] leading-4',
        tone === 'warning' ? 'text-status-warning-text' : 'text-destructive'
      )}
    >
      <span className="min-w-0 flex-1 truncate">{message}</span>
      <button
        type="button"
        className="shrink-0 rounded-sm bg-foreground/[0.08] px-1.5 text-[10px] leading-4 text-foreground hover:bg-foreground/[0.14]"
        onClick={(event) => {
          event.stopPropagation()
          onAction()
        }}
      >
        {actionLabel}
      </button>
    </div>
  )
}
