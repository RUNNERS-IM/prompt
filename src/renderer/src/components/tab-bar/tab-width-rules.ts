// Prompt: each tab is as wide as its whole title (plus icon, model badge and close button), as the
// user asked for full titles. Tabs only narrow, down to the minimum, when the strip runs out of
// room; the strip then scrolls as before. Upstream used fixed 180/220px widths so live titles could
// not resize the strip; a tab now grows or shrinks when its title changes.
export const TAB_CONTAINER_WIDTH_CLASSES = 'w-max min-w-[72px]'

export const TAB_LABEL_WIDTH_CLASSES = 'min-w-0 flex-auto truncate'
