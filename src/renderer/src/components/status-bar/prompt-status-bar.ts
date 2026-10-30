// Status bar segments Prompt never shows. They belong to features Prompt hides
// (plugins, Orca remote servers, skill sharing, the pet), so they would only appear as
// unexplained items. Kept in a Prompt-only file so the daily upstream merge stays clean.
export type PromptStatusSegment = 'plugins' | 'remote-server-update' | 'skill-update' | 'pet'

const PROMPT_HIDDEN_STATUS_SEGMENTS: ReadonlySet<PromptStatusSegment> = new Set([
  'plugins',
  'remote-server-update',
  'skill-update',
  'pet'
])

export function promptShowsStatusSegment(segment: PromptStatusSegment): boolean {
  return !PROMPT_HIDDEN_STATUS_SEGMENTS.has(segment)
}
