import React, { useEffect, useRef } from 'react'
import { agentStateLabel, type AgentDotState } from '@/components/AgentStateDot'
import './prompt-session-state-icon.css'

/** The four looks a Prompt session row can show. */
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

// The done draw plays once per finish. Rows are virtualized and remount on scroll, so the record
// lives outside the component: the last look each session showed, and the finishes already drawn.
const lastKindByKey = new Map<string, PromptSessionIconKind>()
const drawnDoneKeys = new Set<string>()

/** True when this mount should draw the check: the session was seen not done, then turned done. */
function claimDoneDraw(key: string): boolean {
  const previous = lastKindByKey.get(key)
  return previous !== undefined && previous !== 'done' && !drawnDoneKeys.has(key)
}

function recordKind(key: string, kind: PromptSessionIconKind): void {
  lastKindByKey.set(key, kind)
  if (kind === 'done') {
    drawnDoneKeys.add(key)
  } else {
    drawnDoneKeys.delete(key)
  }
}

/** Test seam. */
export function resetPromptSessionIconMemoryForTest(): void {
  lastKindByKey.clear()
  drawnDoneKeys.clear()
}

const COLORS = {
  working: '#e5a33a',
  attention: '#4c8dff',
  done: '#4caf6a',
  waiting: '#8d8d92'
} as const

/**
 * Prompt session status icon: thin line glyphs, 13px, 1.6 stroke, with the chosen motion
 * (prompt-session-state-icon.css). Working: an orange arc turning over a faint ring. Attention:
 * a breathing blue "!". Done: ring then check drawn once when the session finishes. Waiting /
 * background: a clock whose hand turns. Reduced motion shows every icon still and fully drawn.
 */
export function PromptSessionStateIcon({
  state,
  title,
  animationKey
}: {
  state: AgentDotState
  /** Hover text; null suppresses it when the row already shows a reason. */
  title?: string | null
  /** Stable id of the session (pane key); without it the done draw never plays. */
  animationKey?: string
}): React.JSX.Element {
  const kind = promptSessionIconKind(state)
  const label = title === null ? undefined : (title ?? agentStateLabel(state))
  const color = COLORS[kind]

  // Decide once per done episode for this mount so a re-render cannot restart or cut the draw.
  const doneDrawRef = useRef<{ kind: PromptSessionIconKind; play: boolean } | null>(null)
  if (doneDrawRef.current?.kind !== kind) {
    doneDrawRef.current = {
      kind,
      play: kind === 'done' && animationKey !== undefined && claimDoneDraw(animationKey)
    }
  }
  const playDoneDraw = doneDrawRef.current.play
  useEffect(() => {
    if (animationKey !== undefined) {
      recordKind(animationKey, kind)
    }
  }, [animationKey, kind])

  return (
    <span
      className="inline-flex size-[13px] shrink-0 items-center justify-center"
      title={label}
      role="img"
      aria-label={agentStateLabel(state)}
      data-prompt-session-icon={kind}
      data-prompt-done-draw={playDoneDraw ? '' : undefined}
    >
      <svg
        width={13}
        height={13}
        viewBox="0 0 16 16"
        fill="none"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={kind === 'attention' ? 'a-ask' : undefined}
      >
        {kind === 'working' ? (
          <>
            <circle cx="8" cy="8" r="6" stroke="currentColor" className="opacity-35" />
            <g className="a-arc">
              <path d="M8 2a6 6 0 1 1-6 6" stroke={color} />
            </g>
          </>
        ) : null}
        {kind === 'attention' ? (
          <>
            <circle cx="8" cy="8" r="6" stroke={color} />
            <path d="M8 5v3.5M8 11h.01" stroke={color} />
          </>
        ) : null}
        {kind === 'done' ? (
          <>
            <circle
              cx="8"
              cy="8"
              r="6"
              stroke={color}
              className={playDoneDraw ? 'a-ring' : undefined}
            />
            <path
              d="M5.5 8.2l1.7 1.7 3.3-3.4"
              stroke={color}
              className={playDoneDraw ? 'a-check' : undefined}
            />
          </>
        ) : null}
        {kind === 'waiting' ? (
          <>
            <circle cx="8" cy="8" r="6" stroke={color} />
            <g className="a-hand">
              <path d="M8 8V4.8" stroke={color} />
            </g>
            <circle cx="8" cy="8" r=".9" fill={color} stroke="none" />
          </>
        ) : null}
      </svg>
    </span>
  )
}
