import { Bot } from 'lucide-react'
import type { SettingsNavSection } from '@/lib/settings-navigation-types'
import { translate } from '@/i18n/i18n'
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
  // Orca's onboarding checklist (browser, skills, integrations) and the Linear guide.
  'setup-guide',
  'linear',
  // Telemetry is off in Prompt builds (main/telemetry/client.ts TELEMETRY_ENABLED = false), so the
  // opt-out switch would control nothing.
  'privacy'
])

/**
 * Prompt 설정 창 개편(맥 시스템 설정 모양 · 꼭 필요한 것만): Claude 와 상관없는 줄 · 칸을 숨기고
 * 칸 몇 개를 한 칸으로 합친다. 단위 시험에서는 꺼져 Orca 원래 화면이 그대로 시험된다.
 */
export const PROMPT_SIMPLE_SETTINGS = PROMPT_BLOCK_UPSTREAM_SERVICES

// 개편 때 더 숨기는 칸: 온보딩(다른 칸과 겹침), 입력 및 편집(맥에서 안 쓰는 가운데 클릭 붙여넣기 하나뿐),
// Linear(작업 칸이 숨어 있음).
const PROMPT_SIMPLE_HIDDEN_SECTION_IDS: ReadonlySet<string> = new Set([
  'setup-guide',
  'input',
  'linear'
])

// 합친 칸: 왼쪽 목록에서 빠지고, 고른 칸(값) 페이지 아래에 이 순서로 이어 붙는다.
const PROMPT_ABSORBED_SETTINGS_SECTIONS: ReadonlyMap<string, string> = new Map([
  ['agents', 'accounts'],
  ['stats', 'accounts'],
  ['integrations', 'git'],
  ['session-history', 'advanced'],
  ['developer-permissions', 'advanced'],
  ['experimental', 'advanced']
])
const PROMPT_ABSORBED_ORDER: readonly string[] = [...PROMPT_ABSORBED_SETTINGS_SECTIONS.keys()]

export function isPromptVisibleSettingsSection(section: Pick<SettingsNavSection, 'id'>): boolean {
  if (PROMPT_HIDDEN_SETTINGS_SECTION_IDS.has(section.id)) {
    return false
  }
  return !(PROMPT_SIMPLE_SETTINGS && PROMPT_SIMPLE_HIDDEN_SECTION_IDS.has(section.id))
}

/** The sidebar section whose page shows this section (itself unless it was folded into another). */
export function promptSettingsHostSectionId(sectionId: string): string {
  return PROMPT_SIMPLE_SETTINGS
    ? (PROMPT_ABSORBED_SETTINGS_SECTIONS.get(sectionId) ?? sectionId)
    : sectionId
}

/** Flex order that puts a folded section after its host page, or undefined for a sidebar section. */
export function promptAbsorbedSettingsSectionOrder(sectionId: string): number | undefined {
  if (promptSettingsHostSectionId(sectionId) === sectionId) {
    return undefined
  }
  return PROMPT_ABSORBED_ORDER.indexOf(sectionId) + 1
}

/** Page title and description Prompt shows for a merged page, in place of the upstream copy. */
export function promptSettingsSectionCopy(
  sectionId: string
): { title: string; description: string } | null {
  if (!PROMPT_SIMPLE_SETTINGS) {
    return null
  }
  switch (sectionId) {
    case 'appearance':
      return {
        title: translate('prompt.settings.appearance.title', 'Appearance'),
        description: translate(
          'prompt.settings.appearance.description',
          'Theme, language, zoom, fonts, and terminal colors.'
        )
      }
    case 'accounts':
      return {
        title: translate('prompt.settings.claude.title', 'Claude'),
        description: translate(
          'prompt.settings.claude.description',
          'Claude accounts, how new sessions start, and usage.'
        )
      }
    case 'git':
      return {
        title: translate('prompt.settings.git.title', 'Git'),
        description: translate(
          'prompt.settings.git.description',
          'Branches, source control actions, and GitHub · GitLab connections.'
        )
      }
    case 'advanced':
      return {
        title: translate('prompt.settings.advanced.title', 'Advanced'),
        description: translate(
          'prompt.settings.advanced.description',
          'Network, macOS permissions, session search, and experimental features.'
        )
      }
    default:
      return null
  }
}

/** Sidebar group title; the second group is not called "Advanced" so only the page keeps that name. */
export function promptSettingsGroupTitle(groupId: string, upstreamTitle: string): string {
  if (PROMPT_SIMPLE_SETTINGS && groupId === 'advanced') {
    return translate('prompt.settings.group.more', 'More')
  }
  return upstreamTitle
}

// 자주 바꾸는 7칸은 「기본」 묶음 맨 위에, 나머지 칸은 「더 보기」 묶음에 이 순서로 둔다.
const PROMPT_MAIN_SETTINGS_SECTION_IDS: readonly string[] = [
  'general',
  'accounts',
  'appearance',
  'terminal',
  'notifications',
  'shortcuts',
  'quick-commands'
]
const PROMPT_MORE_SETTINGS_SECTION_IDS: readonly string[] = ['git', 'browser', 'ssh', 'advanced']

function withPromptCopy(
  section: SettingsNavSection,
  visible: readonly SettingsNavSection[]
): SettingsNavSection {
  const absorbedEntries = visible.flatMap((entry) =>
    entry !== section && promptSettingsHostSectionId(entry.id) === section.id
      ? [{ title: entry.title }, ...entry.searchEntries]
      : []
  )
  const copy = promptSettingsSectionCopy(section.id)
  return {
    ...section,
    // 「선택 사항」 표: 합친 Claude 칸은 계정만 있는 칸이 아니다.
    badge: section.id === 'accounts' ? undefined : section.badge,
    icon: section.id === 'accounts' ? Bot : section.icon,
    ...(copy ? { title: copy.title, description: copy.description } : {}),
    searchEntries: [...section.searchEntries, ...absorbedEntries]
  }
}

function orderIndex(ids: readonly string[], id: string): number {
  const index = ids.indexOf(id)
  return index === -1 ? ids.length : index
}

export function arrangePromptSettingsSections(
  sections: readonly SettingsNavSection[]
): SettingsNavSection[] {
  const visible = sections.filter(isPromptVisibleSettingsSection)
  if (!PROMPT_BLOCK_UPSTREAM_SERVICES) {
    return visible
  }
  const shown = visible.filter((section) => promptSettingsHostSectionId(section.id) === section.id)
  const main = PROMPT_MAIN_SETTINGS_SECTION_IDS.flatMap((id) => {
    const section = shown.find((entry) => entry.id === id)
    return section ? [{ ...withPromptCopy(section, visible), group: 'setup' }] : []
  })
  const more = shown
    .filter(
      (section) =>
        !PROMPT_MAIN_SETTINGS_SECTION_IDS.includes(section.id) && !section.id.startsWith('repo-')
    )
    .sort(
      (a, b) =>
        orderIndex(PROMPT_MORE_SETTINGS_SECTION_IDS, a.id) -
        orderIndex(PROMPT_MORE_SETTINGS_SECTION_IDS, b.id)
    )
    .map((section) => ({ ...withPromptCopy(section, visible), group: 'advanced' }))
  const repos = shown.filter((section) => section.id.startsWith('repo-'))
  return [...main, ...more, ...repos]
}
