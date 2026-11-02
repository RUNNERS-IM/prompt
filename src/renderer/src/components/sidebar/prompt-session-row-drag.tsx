import React, { useCallback, useMemo, useRef } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type Modifier
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { mirrorWebRuntimeTabMove } from '../tab-bar/web-runtime-tab-move-mirror'
import { dropTabThroughLayoutOwner } from '../tab-group/tab-group-layout-owner-commands'
import { ORCA_LAYOUT_OWNER_IS_MAIN } from '../../../../shared/layout-owner-switch'
import { isPromptLocalWorktree } from '@/lib/prompt-local-worktree'
import { mainWorktreeIdOf, openPromptSessionCopyInWorkspace } from '@/lib/prompt-windows'
import { movePromptClaudeSession } from '@/lib/prompt-session-move'
import { translate } from '@/i18n/i18n'
import { toast } from 'sonner'
import { promptClaudeSessionCopyCommand } from '../../../../shared/prompt-windows'
import { moveShellTabToWorkspace } from '@/lib/shell-tab-workspace-move'
import { resolvePromptMovableSessionId } from '@/lib/prompt-session-copy-origin'
import {
  buildPromptSessionTabSlots,
  isPointInsideRect,
  nextPromptTerminalOrder,
  planPromptSessionReorder
} from './prompt-session-row-order'
import {
  PROMPT_SESSION_DROP_HINT_ATTR,
  PROMPT_SESSION_DROP_TARGET_ATTR,
  planPromptSessionDrop,
  promptSessionDropElementOf,
  promptSessionDropWorktreeIdOf,
  type PromptSessionDropCancelReason,
  type PromptSessionDropPlan
} from './prompt-session-row-drop'

// A short travel threshold keeps a plain click a click (it opens the session).
const POINTER_SENSOR_OPTIONS = { activationConstraint: { distance: 5 } }
// Helper rows sit under their parent and move with it; they are not drag handles themselves.
const NON_HANDLE_SELECTOR = '.worktree-agent-lineage-children'

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 })

/**
 * Apply a sidebar drop to the store: the tab group's tab-bar order (so the tab strip above the
 * terminal follows) and the terminals' sortOrder (the order saved with the session).
 * Returns false when the drop changes nothing (same place, other tab group, unknown tab).
 */
export function commitPromptSessionReorder(args: {
  worktreeId: string
  orderedTabIds: readonly string[]
  activeTabId: string
  overTabId: string
}): boolean {
  const state = useAppStore.getState()
  const groups = state.groupsByWorktree?.[args.worktreeId]
  const slots = buildPromptSessionTabSlots(groups, state.unifiedTabsByWorktree?.[args.worktreeId])
  const plan = planPromptSessionReorder({
    orderedTabIds: args.orderedTabIds,
    activeTabId: args.activeTabId,
    overTabId: args.overTabId,
    slots,
    groups
  })
  if (!plan) {
    return false
  }
  if (plan.groupId && plan.tabOrder && plan.movedUnifiedTabId) {
    const routedToOwner =
      ORCA_LAYOUT_OWNER_IS_MAIN &&
      dropTabThroughLayoutOwner(args.worktreeId, {
        kind: 'reorder',
        tabId: plan.movedUnifiedTabId,
        groupId: plan.groupId,
        tabOrder: plan.tabOrder
      })
    if (!routedToOwner) {
      state.reorderUnifiedTabs(plan.groupId, plan.tabOrder)
      mirrorWebRuntimeTabMove({
        kind: 'reorder',
        worktreeId: args.worktreeId,
        tabId: plan.movedUnifiedTabId,
        targetGroupId: plan.groupId,
        tabOrder: plan.tabOrder
      })
    }
  }
  const terminalIds = (state.tabsByWorktree?.[args.worktreeId] ?? []).map((tab) => tab.id)
  const nextTerminalIds = nextPromptTerminalOrder(terminalIds, plan.orderedTabIds)
  if (nextTerminalIds.some((id, index) => id !== terminalIds[index])) {
    state.reorderTabs(args.worktreeId, nextTerminalIds)
  }
  return true
}

/** Handle a finished drag; exported so tests can drive a drop without a pointer. */
export function handlePromptSessionDragEnd(
  worktreeId: string,
  orderedTabIds: readonly string[],
  event: Pick<DragEndEvent, 'active' | 'over'>
): boolean {
  if (!event.over) {
    // Released outside this workspace's rows: cancel.
    return false
  }
  return commitPromptSessionReorder({
    worktreeId,
    orderedTabIds,
    activeTabId: String(event.active.id),
    overTabId: String(event.over.id)
  })
}

/** A pane of a dragged tab that may hold a conversation (its id is read from the store on drop). */
export type PromptSessionDragPane = { paneKey: string; agentType: string }

/** Decide what dropping a session row on `targetWorktreeId` does, from the store as it is now. */
export function planPromptSessionDropFromStore(args: {
  sourceWorktreeId: string
  targetWorktreeId: string | null
  /** Panes of the dragged tab; null for a plain terminal row. */
  panes: readonly PromptSessionDragPane[] | null
}): PromptSessionDropPlan {
  const state = useAppStore.getState()
  const needsHosts = args.targetWorktreeId && args.targetWorktreeId !== args.sourceWorktreeId
  return planPromptSessionDrop({
    sourceWorktreeId: args.sourceWorktreeId,
    targetWorktreeId: args.targetWorktreeId,
    sourceIsLocal: needsHosts ? isPromptLocalWorktree(state, args.sourceWorktreeId) : true,
    targetIsLocal: needsHosts ? isPromptLocalWorktree(state, args.targetWorktreeId!) : true,
    panes:
      args.panes?.map((pane) => ({
        agentType: pane.agentType,
        sessionId: resolvePromptMovableSessionId(state, pane.paneKey)
      })) ?? null
  })
}

/**
 * Apply a drop on another workspace: a Claude session row opens a copy of the conversation in a
 * new tab there (the original keeps running) and shows it; a plain terminal row moves its tab and
 * shell there once the shell is idle. Returns the plan that was applied.
 */
export function commitPromptSessionCrossWorkspaceDrop(args: {
  tabId: string
  sourceWorktreeId: string
  targetWorktreeId: string | null
  panes: readonly PromptSessionDragPane[] | null
  /** ⌥ was held on release: keep the original and open a copy (Finder's copy-drag). */
  copy?: boolean
}): PromptSessionDropPlan {
  const plan = planPromptSessionDropFromStore(args)
  if (plan.kind === 'fork') {
    const paneKey = claudePaneKeyOf(args.panes, plan.command)
    if (args.copy || !paneKey) {
      openPromptSessionCopyInWorkspace(plan.targetWorktreeId, plan.command)
    } else {
      void movePromptClaudeSession({
        sourceWorktreeId: args.sourceWorktreeId,
        sourceTabId: args.tabId,
        paneKey,
        targetWorktreeId: plan.targetWorktreeId
      })
    }
  } else if (plan.kind === 'cancel') {
    noticePromptSessionDropCancel(plan.reason)
  } else if (plan.kind === 'move-shell') {
    void moveShellTabToWorkspace({
      tabId: args.tabId,
      targetWorktreeId: plan.targetWorktreeId,
      reveal: true
    })
  }
  return plan
}

/** The dragged tab's pane whose live conversation the copy command resumes. */
function claudePaneKeyOf(
  panes: readonly PromptSessionDragPane[] | null,
  command: string
): string | null {
  const state = useAppStore.getState()
  for (const pane of panes ?? []) {
    if (pane.agentType !== 'claude') {
      continue
    }
    const sessionId = resolvePromptMovableSessionId(state, pane.paneKey)
    if (sessionId && command === promptClaudeSessionCopyCommand(sessionId)) {
      return pane.paneKey
    }
  }
  return null
}

/** Say why a drop on another place did nothing; a release over empty space stays silent. */
function noticePromptSessionDropCancel(reason: PromptSessionDropCancelReason): void {
  const message =
    reason === 'remote'
      ? translate(
          'prompt.sessionMove.cancelRemote',
          'Sessions can only move between projects on this computer.'
        )
      : reason === 'no-claude-session'
        ? translate(
            'prompt.sessionMove.cancelNoSession',
            'This session has no Claude conversation to move yet.'
          )
        : reason === 'several-claude-sessions'
          ? translate(
              'prompt.sessionMove.cancelSeveral',
              'This tab has more than one Claude conversation, so it is unclear which to move.'
            )
          : null
  if (message) {
    toast.info(message)
  }
}

/** Topmost workspace rows under the point, skipping the dragged row that follows the pointer. */
function dropElementAt(point: { x: number; y: number } | null): HTMLElement | null {
  if (!point || typeof document === 'undefined' || !document.elementsFromPoint) {
    return null
  }
  for (const element of document.elementsFromPoint(point.x, point.y)) {
    if (element.closest('[data-dragging="true"]')) {
      continue
    }
    return promptSessionDropElementOf(element)
  }
  return null
}

export type PromptSessionDragSection = { groupKey: string; tabIds: string[] }

/** Drag context for one workspace's session rows; each tab group is its own sortable list. */
export function PromptSessionDragList({
  worktreeId,
  orderedTabIds,
  sections,
  panesOfTab,
  children
}: {
  worktreeId: string
  orderedTabIds: readonly string[]
  sections: readonly PromptSessionDragSection[]
  /** Panes of a tab that may hold a conversation; null for a plain terminal row. */
  panesOfTab: (tabId: string) => readonly PromptSessionDragPane[] | null
  children: (section: PromptSessionDragSection) => React.ReactNode
}): React.JSX.Element {
  const listRef = useRef<HTMLDivElement | null>(null)
  // dnd-kit pins the dragged row to vertical moves; the real pointer decides the target workspace.
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const highlightedRef = useRef<HTMLElement | null>(null)
  // ⌥ held right now: a Claude row dropped elsewhere is copied instead of moved.
  const copyKeyRef = useRef(false)
  const highlightedKindRef = useRef<PromptSessionDropPlan['kind'] | null>(null)
  const stopCopyKeyWatchRef = useRef<(() => void) | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, POINTER_SENSOR_OPTIONS))
  const hintFor = useCallback((kind: PromptSessionDropPlan['kind'] | null): string | null => {
    if (kind === 'fork') {
      return copyKeyRef.current
        ? translate('prompt.sessionMove.hintCopy', 'Copy here')
        : translate('prompt.sessionMove.hintMove', 'Move here · ⌥ copies')
    }
    return kind === 'move-shell' ? translate('prompt.sessionMove.hintMoveShell', 'Move here') : null
  }, [])
  const setHighlight = useCallback(
    (element: HTMLElement | null, kind: PromptSessionDropPlan['kind'] | null = null) => {
      highlightedKindRef.current = element ? kind : null
      if (highlightedRef.current !== element) {
        highlightedRef.current?.removeAttribute(PROMPT_SESSION_DROP_TARGET_ATTR)
        highlightedRef.current?.removeAttribute(PROMPT_SESSION_DROP_HINT_ATTR)
        element?.setAttribute(PROMPT_SESSION_DROP_TARGET_ATTR, 'true')
        highlightedRef.current = element
      }
      const hint = element ? hintFor(kind) : null
      if (element && hint) {
        element.setAttribute(PROMPT_SESSION_DROP_HINT_ATTR, hint)
      } else {
        element?.removeAttribute(PROMPT_SESSION_DROP_HINT_ATTR)
      }
    },
    [hintFor]
  )
  const watchCopyKey = useCallback(() => {
    stopCopyKeyWatchRef.current?.()
    copyKeyRef.current = false
    const onKey = (event: KeyboardEvent | PointerEvent): void => {
      if (copyKeyRef.current === event.altKey) {
        return
      }
      copyKeyRef.current = event.altKey
      // Refresh the hint on the lit target so it says copy or move as the key changes.
      setHighlight(highlightedRef.current, highlightedKindRef.current)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onKey, true)
    window.addEventListener('pointermove', onKey, true)
    stopCopyKeyWatchRef.current = () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onKey, true)
      window.removeEventListener('pointermove', onKey, true)
      stopCopyKeyWatchRef.current = null
    }
  }, [setHighlight])
  const crossWorkspaceTarget = useCallback(
    (tabId: string): { element: HTMLElement | null; plan: PromptSessionDropPlan } => {
      const element = dropElementAt(pointerRef.current)
      const targetWorktreeId = promptSessionDropWorktreeIdOf(element, mainWorktreeIdOf)
      const plan = planPromptSessionDropFromStore({
        sourceWorktreeId: worktreeId,
        targetWorktreeId,
        panes: panesOfTab(tabId)
      })
      return { element, plan }
    },
    [worktreeId, panesOfTab]
  )
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    pointerRef.current = args.pointerCoordinates ?? pointerRef.current
    const rect = listRef.current?.getBoundingClientRect()
    if (rect && args.pointerCoordinates && !isPointInsideRect(args.pointerCoordinates, rect)) {
      return []
    }
    // Only rows of the dragged tab's own tab group are targets.
    const groupKey = args.active.data.current?.groupKey
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container) => container.data.current?.groupKey === groupKey
      )
    })
  }, [])
  const modifiers = useMemo(() => [verticalOnly], [])
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      modifiers={modifiers}
      onDragStart={() => {
        pointerRef.current = null
        watchCopyKey()
      }}
      onDragMove={(event) => {
        if (event.over) {
          setHighlight(null)
          return
        }
        // Light up another workspace only when a drop there would copy or move the session.
        const { element, plan } = crossWorkspaceTarget(String(event.active.id))
        const lit = plan.kind === 'fork' || plan.kind === 'move-shell'
        setHighlight(lit ? element : null, lit ? plan.kind : null)
      }}
      onDragCancel={() => {
        setHighlight(null)
        stopCopyKeyWatchRef.current?.()
      }}
      onDragEnd={(event) => {
        setHighlight(null)
        const copy = copyKeyRef.current
        stopCopyKeyWatchRef.current?.()
        if (event.over) {
          handlePromptSessionDragEnd(worktreeId, orderedTabIds, event)
          return
        }
        commitPromptSessionCrossWorkspaceDrop({
          tabId: String(event.active.id),
          sourceWorktreeId: worktreeId,
          targetWorktreeId: promptSessionDropWorktreeIdOf(
            dropElementAt(pointerRef.current),
            mainWorktreeIdOf
          ),
          panes: panesOfTab(String(event.active.id)),
          copy
        })
      }}
    >
      <div ref={listRef} className="flex min-w-0 flex-col gap-0.5">
        {sections.map((section) => (
          <SortableContext
            key={section.groupKey}
            items={section.tabIds}
            strategy={verticalListSortingStrategy}
          >
            {children(section)}
          </SortableContext>
        ))}
      </div>
    </DndContext>
  )
}

/** One draggable tab: its row, plus any split-pane or helper rows drawn with it. */
export function PromptSessionDragItem({
  tabId,
  groupKey,
  children
}: {
  tabId: string
  groupKey: string
  children: React.ReactNode
}): React.JSX.Element {
  const data = useMemo(() => ({ groupKey }), [groupKey])
  const sortable = useSortable({ id: tabId, data })
  const startDrag = sortable.listeners?.onPointerDown
  // Capture phase: the rows stop pointerdown from bubbling (so the workspace card does not start
  // its own drag); listening on the way down still lets a session row arm this drag.
  const onPointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.target instanceof Element && event.target.closest(NON_HANDLE_SELECTOR)) {
        return
      }
      startDrag?.(event)
    },
    [startDrag]
  )
  return (
    <div
      ref={sortable.setNodeRef}
      className={cn('min-w-0', sortable.isDragging && 'relative z-10 opacity-80')}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition
      }}
      onPointerDownCapture={onPointerDownCapture}
      data-prompt-session-drag-item={tabId}
      data-dragging={sortable.isDragging ? 'true' : undefined}
    >
      {children}
    </div>
  )
}
