// Prompt: each tab is as wide as its whole title (plus icon, model badge and close button), as the
// user asked for full titles. Tabs only narrow, down to the minimum, when the strip runs out of
// room; the strip then scrolls as before. Upstream used fixed 330px preferred widths with a 144px
// floor; a Prompt tab instead grows or shrinks when its title changes.
export const TAB_CONTAINER_WIDTH_CLASSES = 'w-max min-w-[72px]'

// `tab-label` lets the hover card open only when the title is actually truncated.
export const TAB_LABEL_WIDTH_CLASSES = 'tab-label min-w-0 flex-auto truncate'
