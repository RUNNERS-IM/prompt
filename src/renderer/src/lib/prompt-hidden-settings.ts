import { Bot, CircleUserRound, Info } from 'lucide-react'
import type { SettingsNavSection } from '@/lib/settings-navigation-types'
import { translate } from '@/i18n/i18n'
import { getRendererAppPlatform } from '@/lib/renderer-app-platform'
import { isWebClientLocation } from '@/lib/web-client-location'
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

// 「적용할 맥」 막대를 쓰는 칸: 고른 맥의 계정 · 에이전트 · 터미널 · Git 한도를 보여 준다.
const PROMPT_HOST_SCOPED_SETTINGS_SECTION_IDS: ReadonlySet<string> = new Set([
  'accounts',
  'terminal',
  'git'
])

/** Whether the per-Mac picker belongs above this page; other pages apply to every Mac. */
export function promptSettingsSectionUsesHostScope(sectionId: string): boolean {
  return (
    !PROMPT_SIMPLE_SETTINGS ||
    PROMPT_HOST_SCOPED_SETTINGS_SECTION_IDS.has(promptSettingsHostSectionId(sectionId))
  )
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
          'How new sessions start, and usage.'
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
        // The permissions box only shows in the Mac desktop app (settings-remote-security-section-renderers).
        description:
          getRendererAppPlatform() === 'darwin' && !isWebClientLocation()
            ? translate(
                'prompt.settings.advanced.description',
                'Network, macOS permissions, session search, and experimental features.'
              )
            : translate(
                'prompt.settings.advanced.descriptionNoPermissions',
                'Network, session search, and experimental features.'
              )
      }
    default:
      return null
  }
}

// 묶음 이름: Claude 와 계정 · 터미널과 도구 · 앱 (runners-wiki 2026-11-19 사용자 위주 화면 개선 5B).
const PROMPT_SETTINGS_GROUP_TITLES: Readonly<Record<string, readonly [string, string]>> = {
  setup: ['prompt.settings.group.claude', 'Claude & Accounts'],
  workflows: ['prompt.settings.group.tools', 'Terminal & Tools'],
  interface: ['prompt.settings.group.app', 'App']
}

export function promptSettingsGroupTitle(groupId: string, upstreamTitle: string): string {
  const title = PROMPT_SIMPLE_SETTINGS ? PROMPT_SETTINGS_GROUP_TITLES[groupId] : undefined
  return title ? translate(title[0], title[1]) : upstreamTitle
}

// 묶음마다 이 순서로 둔다. 목록에 없는 칸은 「앱」 묶음 끝에 붙는다.
const PROMPT_ABOUT_SETTINGS_SECTION_ID = 'prompt-about'
const PROMPT_ACCOUNT_SETTINGS_SECTION_ID = 'prompt-account'
const PROMPT_SETTINGS_GROUP_SECTION_IDS: readonly (readonly [string, readonly string[]])[] = [
  ['setup', ['accounts', PROMPT_ACCOUNT_SETTINGS_SECTION_ID, 'notifications']],
  ['workflows', ['terminal', 'shortcuts', 'quick-commands', 'git', 'browser', 'ssh']],
  ['interface', ['appearance', 'general', 'advanced', PROMPT_ABOUT_SETTINGS_SECTION_ID]]
]
const PROMPT_FALLBACK_SETTINGS_GROUP = 'interface'

/** The pane Settings opens on when nothing asked for a specific one. */
export const DEFAULT_SETTINGS_SECTION_ID = PROMPT_BLOCK_UPSTREAM_SERVICES ? 'accounts' : 'general'

/** Settings › About: version, RUNNERS apps and open source notices (replaces the About window). */
function promptAboutSettingsSection(): SettingsNavSection {
  const title = translate('prompt.settings.about.title', 'About')
  const description = translate(
    'prompt.settings.about.description',
    'Version, RUNNERS apps, and open source notices.'
  )
  return {
    id: PROMPT_ABOUT_SETTINGS_SECTION_ID,
    title,
    description,
    icon: Info,
    searchEntries: [{ title, description, keywords: ['version', 'about', 'license', 'RUNNERS'] }],
    group: 'setup'
  }
}
/** Settings › Account: the RUNNERS account the five RUNNERS apps share (moved off the tab strip). */
function promptAccountSettingsSection(): SettingsNavSection {
  const title = translate('prompt.settings.account.title', 'Account')
  const description = translate(
    'prompt.settings.account.description',
    "The RUNNERS account every RUNNERS app shares, and this Mac's Claude accounts."
  )
  return {
    id: PROMPT_ACCOUNT_SETTINGS_SECTION_ID,
    title,
    description,
    icon: CircleUserRound,
    searchEntries: [
      {
        title,
        description,
        keywords: ['RUNNERS', 'login', 'sign in', 'email', 'Claude', 'account']
      }
    ],
    group: 'setup'
  }
}
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

export function arrangePromptSettingsSections(
  sections: readonly SettingsNavSection[]
): SettingsNavSection[] {
  const visible = sections.filter(isPromptVisibleSettingsSection)
  if (!PROMPT_BLOCK_UPSTREAM_SERVICES) {
    return visible
  }
  const shown = [
    ...visible.filter((section) => promptSettingsHostSectionId(section.id) === section.id),
    promptAccountSettingsSection(),
    promptAboutSettingsSection()
  ]
  const listedIds = new Set(PROMPT_SETTINGS_GROUP_SECTION_IDS.flatMap(([, ids]) => ids))
  const unlisted = shown.filter(
    (section) => !listedIds.has(section.id) && !section.id.startsWith('repo-')
  )
  const grouped = PROMPT_SETTINGS_GROUP_SECTION_IDS.flatMap(([group, ids]) => [
    ...ids.flatMap((id) => {
      const section = shown.find((entry) => entry.id === id)
      return section ? [{ ...withPromptCopy(section, visible), group }] : []
    }),
    ...(group === PROMPT_FALLBACK_SETTINGS_GROUP
      ? unlisted.map((section) => ({ ...withPromptCopy(section, visible), group }))
      : [])
  ])
  const repos = shown.filter((section) => section.id.startsWith('repo-'))
  return [...grouped, ...repos]
}
