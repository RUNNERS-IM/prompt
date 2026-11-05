import type {
  WorkspaceGroupBy,
  WorkspaceViewOption,
  WorkspaceViewOptionKey,
  WorkspaceViewSection
} from '../../../../shared/workspace-view/workspace-view-options'
import { isPromptTwoLevelSidebar } from './prompt-sidebar-layout'

type ShownSection = { section: WorkspaceViewSection; options: WorkspaceViewOption[] }

export type PromptWorkspaceOptionState = {
  groupBy: WorkspaceGroupBy
  hideAutomationGeneratedWorkspaces: boolean
  hideCliCreatedWorkspaces: boolean
}

// Card layout and properties do nothing in the two-level sidebar, and it is drawn for project
// grouping. Automations are hidden. A choice that is already on stays listed so it can be undone.
function promptHidesOption(
  key: WorkspaceViewOptionKey,
  state: PromptWorkspaceOptionState
): boolean {
  switch (key) {
    case 'cardLayout':
    case 'cardProperties':
    case 'cardDisplay':
      return true
    case 'groupBy':
      return state.groupBy === 'repo'
    case 'hideAutomationGeneratedWorkspaces':
      return !state.hideAutomationGeneratedWorkspaces
    case 'hideCliCreatedWorkspaces':
      return !state.hideCliCreatedWorkspaces
    default:
      return false
  }
}

/** The workspace options menu sections Prompt shows; upstream sections when the card layout is on. */
export function promptWorkspaceViewSections(
  sections: ShownSection[],
  state: PromptWorkspaceOptionState
): ShownSection[] {
  if (!isPromptTwoLevelSidebar()) {
    return sections
  }
  return sections
    .map(({ section, options }) => ({
      section,
      options: options.filter((option) => !promptHidesOption(option.key, state))
    }))
    .filter(({ options }) => options.length > 0)
}
