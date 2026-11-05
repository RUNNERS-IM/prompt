import type { SettingsNavSection } from '@/lib/settings-navigation-types'
import { PROMPT_BLOCK_UPSTREAM_SERVICES } from '../../../shared/prompt-upstream'

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
  'tasks',
  // Telemetry is off in Prompt builds (main/telemetry/client.ts TELEMETRY_ENABLED = false), so the
  // opt-out switch would control nothing.
  'privacy'
])

export function isPromptVisibleSettingsSection(section: Pick<SettingsNavSection, 'id'>): boolean {
  return !PROMPT_HIDDEN_SETTINGS_SECTION_IDS.has(section.id)
}

// 자주 바꾸는 7칸만 「기본」 묶음 맨 위에 이 순서로 두고, 나머지는 「고급」 묶음으로 보낸다.
const PROMPT_MAIN_SETTINGS_SECTION_IDS: readonly string[] = [
  'accounts',
  'appearance',
  'terminal',
  'shortcuts',
  'notifications',
  'quick-commands',
  'general'
]

export function arrangePromptSettingsSections(
  sections: readonly SettingsNavSection[]
): SettingsNavSection[] {
  const visible = sections.filter(isPromptVisibleSettingsSection)
  if (!PROMPT_BLOCK_UPSTREAM_SERVICES) {
    return visible
  }
  const main = PROMPT_MAIN_SETTINGS_SECTION_IDS.flatMap((id) => {
    const section = visible.find((entry) => entry.id === id)
    return section ? [{ ...section, group: 'setup' }] : []
  })
  const rest = visible
    .filter((section) => !PROMPT_MAIN_SETTINGS_SECTION_IDS.includes(section.id))
    .map((section) =>
      section.id.startsWith('repo-') ? section : { ...section, group: 'advanced' }
    )
  return [...main, ...rest]
}
