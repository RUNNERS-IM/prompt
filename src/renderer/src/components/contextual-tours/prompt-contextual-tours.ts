/**
 * Prompt turns contextual tours off for everyone: the small step-by-step bubbles Orca shows
 * when a feature first appears (for example "Split terminal 1 / 2" over an empty window).
 * Every tour request goes through the store's requestContextualTour, which checks this.
 */
export function arePromptContextualToursEnabled(): boolean {
  return false
}
