import React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  resolveAutomationListEmptyState,
  type AutomationListEmptyStateInput
} from './automation-list-empty-state'
import {
  recoveryActionLabel,
  type AutomationHostRecoveryAction
} from './automation-host-status-descriptors'
import emptyPanda from '../runners-account/assets/panda/empty.webp'

/** Renders whichever empty/partial/failure state the list is in; nothing when rows exist. */

export type AutomationListEmptyViewProps = AutomationListEmptyStateInput & {
  onRecover?: (action: AutomationHostRecoveryAction) => void
  className?: string
}

// Prompt: the kit's empty-list panda only where the list is truly empty, not on host errors.
const EMPTY_KINDS = new Set(['search-no-match', 'host-empty', 'all-hosts-empty'])

export function AutomationListEmptyView({
  onRecover,
  className,
  ...input
}: AutomationListEmptyViewProps): React.JSX.Element | null {
  const state = resolveAutomationListEmptyState(input)
  const recovery = state.recovery
  if (state.kind === 'rows') {
    return null
  }

  return (
    <div
      data-empty-state={state.kind}
      className={cn(
        'flex flex-col items-center gap-1.5 px-6 py-10 text-center text-muted-foreground',
        className
      )}
    >
      {EMPTY_KINDS.has(state.kind) ? (
        <img src={emptyPanda} alt="" className="mb-2 size-28" draggable={false} />
      ) : null}
      <p className="text-sm text-foreground">{state.title}</p>
      {state.detail ? <p className="text-xs">{state.detail}</p> : null}
      {recovery && onRecover ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1.5"
          onClick={() => onRecover(recovery)}
        >
          {recoveryActionLabel(recovery)}
        </Button>
      ) : null}
    </div>
  )
}
