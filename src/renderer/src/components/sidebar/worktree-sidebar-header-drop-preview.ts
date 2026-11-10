import { getWorktreeSidebarBoundaryDrop } from './worktree-sidebar-drag-autoscroll'

export type WorktreeSidebarHeaderDragRect = {
  headerIndex: number
  top: number
  bottom: number
  sectionBottom?: number
}

export type WorktreeSidebarHeaderDropPreview = {
  dropIndex: number
  dropIndicatorY: number
}

const INDICATOR_GAP_PX = 4

export function computeWorktreeSidebarHeaderDropPreview<
  TRect extends WorktreeSidebarHeaderDragRect
>(args: {
  pointerY: number
  containerTop: number
  scrollTop: number
  rects: readonly TRect[]
  headerCount: number
  sourceHeaderIndex: number
  getId: (rect: TRect) => string
  // Measured scroll-content bottom bounds live snap slots; geometry-only tests may omit it.
  contentBottom?: number
}): WorktreeSidebarHeaderDropPreview | null {
  const { sourceHeaderIndex } = args
  if (args.rects.length === 0 || args.headerCount === 0 || sourceHeaderIndex < 0) {
    return null
  }

  const localY = args.pointerY - args.containerTop + args.scrollTop
  // Bound every preview branch, including estimated edge slots, by real list content.
  if (args.contentBottom !== undefined && localY > args.contentBottom) {
    return null
  }
  const first = args.rects[0]!
  const last = args.rects.at(-1)!
  const lastBoundaryBottom = Math.max(last.bottom, last.sectionBottom ?? last.bottom)
  const boundaryDrop = getWorktreeSidebarBoundaryDrop({
    localY,
    firstRect: {
      worktreeId: args.getId(first),
      groupIndex: first.headerIndex,
      top: first.top,
      bottom: first.bottom
    },
    lastRect: {
      worktreeId: args.getId(last),
      groupIndex: last.headerIndex,
      top: last.top,
      bottom: lastBoundaryBottom
    },
    sourceGroupSize: args.headerCount
  })
  if (boundaryDrop.kind === 'outside') {
    return null
  }
  if (boundaryDrop.kind === 'drop') {
    if (
      boundaryDrop.dropIndex === sourceHeaderIndex ||
      boundaryDrop.dropIndex === sourceHeaderIndex + 1
    ) {
      return null
    }
    return {
      dropIndex: boundaryDrop.dropIndex,
      dropIndicatorY: Math.max(args.scrollTop, boundaryDrop.indicatorY)
    }
  }

  const target = args.rects.findLast((rect) => rect.top <= localY)
  if (!target || target.headerIndex === sourceHeaderIndex) {
    return null
  }
  // Dropping anywhere on a section takes that section's place, so one-step moves are reachable.
  const dropIndex =
    target.headerIndex < sourceHeaderIndex ? target.headerIndex : target.headerIndex + 1
  const nextRect = args.rects.find((rect) => rect.headerIndex >= dropIndex)
  const indicatorY = nextRect
    ? Math.max(0, nextRect.top - INDICATOR_GAP_PX)
    : Math.max(target.bottom, target.sectionBottom ?? target.bottom) + INDICATOR_GAP_PX
  return {
    dropIndex,
    dropIndicatorY: Math.max(args.scrollTop, indicatorY)
  }
}
