import { PROMPT_SIMPLE_SETTINGS } from '@/lib/prompt-hidden-settings'

// Below xl, give the rail only content height and the list the remaining space; equal auto rows can overlap.
// Prompt's 680px settings column stacks the filter rail above the list at every width.
export const SHORTCUT_LISTS_CLASS = PROMPT_SIMPLE_SETTINGS
  ? 'flex min-h-0 flex-1 flex-col gap-6'
  : 'grid min-h-0 flex-1 gap-6 max-xl:grid-rows-[auto_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)]'

/**
 * Prompt: the controls above the list form one box under the page's title row, as in the other
 * settings pages; the list groups below are their own boxes (ShortcutRowsList).
 */
export function ShortcutsPromptLayout(props: {
  controls: React.ReactNode
  lists: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <section className="shrink-0 space-y-3">{props.controls}</section>
      {props.lists}
    </div>
  )
}
