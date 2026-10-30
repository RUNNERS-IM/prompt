// Definite widths prevent live titles from resizing the strip; flex-shrink still allows narrowing to the minimum.
// Prompt: wide enough for a 15-20 character Korean session name ("[PUDDING] Sentry 이슈") plus the
// model badge; tabs still shrink toward the minimum when the strip runs out of room.
export const TAB_CONTAINER_WIDTH_CLASSES = 'w-[240px] min-w-[72px] min-[1280px]:w-[300px]'

export const TAB_LABEL_WIDTH_CLASSES = 'min-w-0 flex-1 truncate'
