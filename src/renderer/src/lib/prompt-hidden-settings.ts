import type { SettingsNavSection } from '@/lib/settings-navigation-types'

// Prompt only runs Claude Code sessions, so these Orca settings pages are hidden from the
// Settings sidebar and the Cmd+J palette. Several of them talk to Orca's own servers
// (login.onorca.dev, relay.onorca.dev, share.onorca.dev). Kept in a Prompt-only file so the
// daily upstream merge does not conflict; when upstream adds a new page, review this list.
export const PROMPT_HIDDEN_SETTINGS_SECTION_IDS: ReadonlySet<string> = new Set([
  'orchestration',
  'computer-use',
  'voice',
  'orca-account',
  'mobile',
  'artifacts',
  'share-skills',
  'mobile-emulator',
  'floating-workspace',
  'servers',
  'plugins',
  'automations',
  'tasks'
])

export function isPromptVisibleSettingsSection(section: Pick<SettingsNavSection, 'id'>): boolean {
  return !PROMPT_HIDDEN_SETTINGS_SECTION_IDS.has(section.id)
}
