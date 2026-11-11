import type { ActiveRightSidebarTab } from '@/store/slices/editor'

const TOP_ACTIVITY_BUTTON_WIDTH = 36
const TOP_ACTIVITY_TITLE_BUTTON_WIDTH = 76
const TOP_ACTIVITY_MORE_BUTTON_WIDTH = 32

function buttonWidth(item: { showsTitle?: boolean }): number {
  return item.showsTitle ? TOP_ACTIVITY_TITLE_BUTTON_WIDTH : TOP_ACTIVITY_BUTTON_WIDTH
}

export function getTopActivityBarLayout<
  T extends { id: ActiveRightSidebarTab; showsTitle?: boolean }
>(
  items: readonly T[],
  availableWidth: number | null,
  activeId: ActiveRightSidebarTab
): { visibleItems: T[]; overflowItems: T[] } {
  if (!availableWidth || !Number.isFinite(availableWidth)) {
    return { visibleItems: [...items], overflowItems: [] }
  }
  if (items.reduce((total, item) => total + buttonWidth(item), 0) <= availableWidth) {
    return { visibleItems: [...items], overflowItems: [] }
  }

  let remaining = availableWidth - TOP_ACTIVITY_MORE_BUTTON_WIDTH
  let fitting = 0
  while (fitting < items.length - 1 && remaining >= buttonWidth(items[fitting])) {
    remaining -= buttonWidth(items[fitting])
    fitting += 1
  }
  const visibleCount = Math.max(1, fitting)
  const visibleItems = items.slice(0, visibleCount)
  const activeItem = items.find((item) => item.id === activeId)
  if (activeItem && !visibleItems.some((item) => item.id === activeItem.id)) {
    visibleItems[visibleItems.length - 1] = activeItem
  }

  const visibleIds = new Set(visibleItems.map((item) => item.id))
  return {
    visibleItems,
    overflowItems: items.filter((item) => !visibleIds.has(item.id))
  }
}
