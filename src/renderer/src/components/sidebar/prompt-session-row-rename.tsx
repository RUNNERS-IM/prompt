import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { isImeCompositionKeyDown } from '@/lib/ime-composition-keyboard-event'
import { terminalTabSetName } from '../../../../shared/tab-title-resolution'
import { promptNewSessionLabel } from './prompt-session-row-name'

const PROJECT_PREFIX = /^\[[^\]\n]+\]\s*/
/** Frames to keep asking for focus while the closing menu may still take it back. */
const FOCUS_ATTEMPT_FRAMES = 10

/** Asks the sidebar row of a tab to open its rename box; the row that takes it cancels the event. */
export const PROMPT_RENAME_SESSION_ROW_EVENT = 'prompt-rename-session-row'

export type PromptRenameSessionRowDetail = { tabId: string }

/**
 * ⌘R lands on the session's sidebar row when that row is on screen ([PROMPT] 사이드바 이름 바꾸기
 * 2A). Returns false when no row took it, so the caller can fall back to the tab strip's box.
 */
export function requestPromptSessionRowRename(tabId: string): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  const event = new CustomEvent<PromptRenameSessionRowDetail>(PROMPT_RENAME_SESSION_ROW_EVENT, {
    detail: { tabId },
    cancelable: true
  })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

type PromptSessionRowRenameTarget = {
  tabId: string
  worktreeId: string
  rowName: string
  onDone: () => void
}

/** Set by a session row's menu while its rename box is open; the row draws the box in its name's place. */
export const PromptSessionRowRenameContext = createContext<PromptSessionRowRenameTarget | null>(
  null
)

export function usePromptSessionRowRename(): PromptSessionRowRenameTarget | null {
  return useContext(PromptSessionRowRenameContext)
}

/**
 * What a session rename box selects when it opens: the topic after a leading "[PROJECT] ", so
 * typing replaces only the topic ([PROMPT] 세션 이름 1C). A name with no such prefix, or nothing
 * after it, is selected whole.
 */
export function promptRenameTopicRange(value: string): [number, number] {
  const prefix = PROJECT_PREFIX.exec(value)?.[0] ?? ''
  return prefix.length < value.length ? [prefix.length, value.length] : [0, value.length]
}

/**
 * Text a session rename box opens with, and whether that text is the tab's set name. A row still
 * called "New Session" opens empty rather than offering the stand-in as a name.
 */
export function promptRenameOpenValue(
  setName: string,
  rowName: string
): { value: string; isSetName: boolean } {
  if (setName) {
    return { value: setName, isSetName: true }
  }
  return { value: rowName === promptNewSessionLabel() ? '' : rowName, isSetName: false }
}

/**
 * Rename box drawn in place of a sidebar session row's name ([PROMPT] 사이드바 이름 바꾸기 1B), so
 * the status icon and the second line stay put and nothing shows through it. Enter or clicking
 * away saves, Escape cancels; leaving an unnamed row's text untouched saves nothing, as on the tab.
 */
export function PromptSessionRowRename({
  tabId,
  worktreeId,
  rowName,
  onDone
}: {
  tabId: string
  worktreeId: string
  rowName: string
  onDone: () => void
}): React.JSX.Element {
  // Snapshot once: a title the agent sets mid-edit must not overwrite what is being typed.
  const [opened] = useState(() => {
    const tab = useAppStore
      .getState()
      .tabsByWorktree?.[worktreeId]?.find((candidate) => candidate.id === tabId)
    return promptRenameOpenValue(tab ? terminalTabSetName(tab) : '', rowName)
  })
  const [value, setValue] = useState(opened.value)
  const resolvedRef = useRef(false)
  const focusFrameRef = useRef<number | null>(null)

  const finish = useCallback(
    (save: boolean, typed: string) => {
      if (resolvedRef.current) {
        return
      }
      resolvedRef.current = true
      // Why: read the field itself, so a Hangul syllable committed by the blur is not lost.
      const trimmed = typed.trim()
      if (save && (opened.isSetName ? trimmed !== opened.value : trimmed !== opened.value.trim())) {
        useAppStore.getState().setTabCustomTitle(tabId, trimmed.length > 0 ? trimmed : null)
      }
      onDone()
    },
    [onDone, opened, tabId]
  )

  const finishRef = useRef(finish)
  finishRef.current = finish
  const inputRef = useRef<HTMLInputElement | null>(null)

  const setInputElement = useCallback((input: HTMLInputElement | null) => {
    inputRef.current = input
    if (focusFrameRef.current !== null) {
      cancelAnimationFrame(focusFrameRef.current)
      focusFrameRef.current = null
    }
    if (!input) {
      return
    }
    // Why: defer past the closing menu's own focus handling, as the tab's rename box does, and
    // ask again while that menu still takes focus back. A box that never held focus never blurs,
    // so it would stay drawn over the row's name.
    let attemptsLeft = FOCUS_ATTEMPT_FRAMES
    let selected = false
    const attempt = (): void => {
      focusFrameRef.current = null
      if (document.activeElement !== input) {
        input.focus()
      }
      if (!selected && document.activeElement === input) {
        selected = true
        input.setSelectionRange(...promptRenameTopicRange(input.value))
      }
      attemptsLeft -= 1
      if (attemptsLeft > 0 && (!selected || document.activeElement !== input)) {
        focusFrameRef.current = requestAnimationFrame(attempt)
      }
    }
    focusFrameRef.current = requestAnimationFrame(attempt)
  }, [])

  // Clicking anywhere else saves and closes, even when the box never received focus.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const input = inputRef.current
      if (!input || (event.target instanceof Node && input.contains(event.target))) {
        return
      }
      finishRef.current(true, input.value)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [])

  const stop = (event: React.SyntheticEvent): void => event.stopPropagation()

  return (
    <Input
      ref={setInputElement}
      data-prompt-session-rename=""
      value={value}
      placeholder={rowName}
      aria-label={translate('prompt.sidebarSessions.renameNamed', 'Rename {{name}}', {
        name: rowName
      })}
      // Why: the background surface also sets the dark background; the default one is 30% see-through.
      surface="background"
      density="row"
      className="min-w-0 flex-1"
      onChange={(event) => setValue(event.target.value)}
      onBlur={(event) => finish(true, event.currentTarget.value)}
      onKeyDown={(event) => {
        if (isImeCompositionKeyDown(event)) {
          return
        }
        if (event.key === 'Enter' || event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          finish(event.key === 'Enter', event.currentTarget.value)
        }
      }}
      // Why: keep typing and clicks in the box from activating, dragging or right-clicking the row.
      onClick={stop}
      onDoubleClick={stop}
      onPointerDown={stop}
      onMouseDown={stop}
      onContextMenu={stop}
    />
  )
}
