import React from 'react'
import { X } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { usePromptPendingSessionMove } from '@/lib/prompt-session-move-pending'

/**
 * Under a session row while it waits to move to another project: where it is going, and ✕ to
 * cancel (decision 2: the toast's Cancel can be closed, this line stays until the move ends).
 */
export function PromptSessionRowPendingMove({
  tabId
}: {
  tabId: string
}): React.JSX.Element | null {
  const pending = usePromptPendingSessionMove(tabId)
  if (!pending) {
    return null
  }
  const cancelLabel = translate('prompt.sessionMove.cancel', 'Cancel')
  return (
    <div
      className="flex h-5 min-w-0 items-center gap-1 pl-5 pr-1 text-[10px] leading-none text-status-warning-text"
      data-prompt-session-pending-move=""
      // The row is a drag handle; a press here is for the cancel button only.
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <span className="min-w-0 flex-1 truncate">
        {translate('prompt.sessionMove.movingTo', "Moving to '{{name}}'", {
          name: pending.targetLabel
        })}
      </span>
      <button
        type="button"
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-worktree-sidebar-accent hover:text-foreground"
        aria-label={cancelLabel}
        title={cancelLabel}
        onClick={(event) => {
          event.stopPropagation()
          pending.cancel()
        }}
      >
        <X className="size-3" strokeWidth={1.75} />
      </button>
    </div>
  )
}
