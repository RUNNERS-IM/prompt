declare global {
  // Set only by the unit-test setup so upstream WorktreeCard tests keep covering the card layout.
  var __PROMPT_UPSTREAM_WORKTREE_CARD__: boolean | undefined
}

/**
 * Prompt shows the sidebar in two levels: project header, then one row per session. The upstream
 * workspace card (title, branch line, "N agents") is only drawn when tests ask for it.
 */
export function isPromptTwoLevelSidebar(): boolean {
  return globalThis.__PROMPT_UPSTREAM_WORKTREE_CARD__ !== true
}
