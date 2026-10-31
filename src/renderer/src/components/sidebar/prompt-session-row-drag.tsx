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
import {
  buildPromptSessionTabSlots,
  isPointInsideRect,
  nextPromptTerminalOrder,
  planPromptSessionReorder
} from './prompt-session-row-order'

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

export type PromptSessionDragSection = { groupKey: string; tabIds: string[] }

/** Drag context for one workspace's session rows; each tab group is its own sortable list. */
export function PromptSessionDragList({
  worktreeId,
  orderedTabIds,
  sections,
  children
}: {
  worktreeId: string
  orderedTabIds: readonly string[]
  sections: readonly PromptSessionDragSection[]
  children: (section: PromptSessionDragSection) => React.ReactNode
}): React.JSX.Element {
  const listRef = useRef<HTMLDivElement | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, POINTER_SENSOR_OPTIONS))
  const collisionDetection = useCallback<CollisionDetection>((args) => {
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
      onDragEnd={(event) => {
        handlePromptSessionDragEnd(worktreeId, orderedTabIds, event)
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
