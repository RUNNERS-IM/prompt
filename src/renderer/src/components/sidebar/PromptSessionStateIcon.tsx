import React from 'react'
import { agentStateLabel, type AgentDotState } from '@/components/AgentStateDot'
import { cn } from '@/lib/utils'

/** The four looks a Prompt session row can show. Motion for each is added here, in one place. */
export type PromptSessionIconKind = 'working' | 'attention' | 'done' | 'waiting'

export function promptSessionIconKind(state: AgentDotState): PromptSessionIconKind {
  switch (state) {
    case 'working':
      return 'working'
    case 'permission':
    case 'blocked':
    case 'waiting':
    case 'failed':
    case 'interrupted':
      return 'attention'
    case 'done':
      return 'done'
    case 'monitoring':
    case 'idle':
    case 'unverifiable':
    case 'unconfirmed':
      return 'waiting'
  }
}

const SIZE = 13
const STROKE = 1.6
const COLORS = {
  working: '#e5a33a',
  attention: '#4c8dff',
  done: '#4caf6a',
  waiting: '#8d8d92'
} as const

/**
 * Prompt session status icon: thin line glyphs, all 13px with a 1.6 stroke.
 * Working: a ring with an orange arc that turns (still under prefers-reduced-motion).
 * Attention: blue circle with "!". Done: green circle with a check. Waiting/background: grey clock.
 */
export function PromptSessionStateIcon({
  state,
  title
}: {
  state: AgentDotState
  /** Hover text; null suppresses it when the row already shows a reason. */
  title?: string | null
}): React.JSX.Element {
  const kind = promptSessionIconKind(state)
  const label = title === null ? undefined : (title ?? agentStateLabel(state))
  const color = COLORS[kind]
  return (
    <span
      className="inline-flex size-[13px] shrink-0 items-center justify-center"
      title={label}
      role="img"
      aria-label={agentStateLabel(state)}
      data-prompt-session-icon={kind}
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox="0 0 16 16"
        fill="none"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={cn(
          kind === 'working' && 'animate-spin [animation-duration:1.4s] motion-reduce:animate-none'
        )}
      >
        {kind === 'working' ? (
          <>
            <circle cx="8" cy="8" r="6" stroke="currentColor" className="opacity-35" />
            <path d="M8 2a6 6 0 0 1 6 6" stroke={color} />
          </>
        ) : (
          <circle cx="8" cy="8" r="6" stroke={color} />
        )}
        {kind === 'attention' ? <path d="M8 5v3.5M8 11h.01" stroke={color} /> : null}
        {kind === 'done' ? <path d="M5.5 8.2l1.7 1.7 3.3-3.4" stroke={color} /> : null}
        {kind === 'waiting' ? <path d="M8 5v3l2 1.5" stroke={color} /> : null}
      </svg>
    </span>
  )
}
