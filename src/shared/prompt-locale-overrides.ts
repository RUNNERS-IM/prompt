import promptKoFill from './prompt-ko-fill.json'

// Prompt keeps the upstream catalogs (src/renderer/src/i18n/locales/*.json) untouched so the
// daily merge from Orca does not conflict. Wording Prompt wants different, and keys the
// Korean catalog has not translated yet, live here instead and are laid over the catalog when
// it loads (main and renderer both go through createOrcaI18n).
//
// Keys are full i18next keys (dot separated, plural keys keep their _other suffix). Values must
// keep every {{placeholder}} and <0>tag</0> of the English text; prompt-locale-overrides.test.ts
// checks this and also fails when upstream renames or drops a key listed here.

/** Korean wording Prompt changes on purpose (the upstream Korean exists but reads wrong). */
export const PROMPT_KO_WORDING: Readonly<Record<string, string>> = {
  // Workspace right-click: "Update" opens the rename / comment dialog, not an app update.
  'auto.components.sidebar.WorktreeContextMenu.439fa94d53': '이름 · 메모 바꾸기',
  // Settings sidebar group "Set Up" (general + integrations); "설정 시작" read as a verb.
  'auto.components.settings.Settings.9abb9be3bc': '기본',
  // English words left in the Korean catalog.
  'tray.activityWaitingSuffix': '활동 대기 중',
  'auto.components.NewWorkspaceComposerCard.ba64270bdb': '에이전트 구성',
  'auto.components.NewWorkspaceComposerCard.ab63f25397': '에이전트 설정 열기',
  'auto.components.status.bar.SkillUpdateStatusSegment.runningLabel': '스킬 업데이트 중',
  'auto.components.status.bar.SkillUpdateStatusSegment.runningOne': '{{value0}} 업데이트 중…',
  'auto.components.status.bar.SkillUpdateStatusSegment.successLabel': '스킬 업데이트됨',
  'auto.components.skills.SkillFreshnessUpdateDialog.progressAria': '스킬 업데이트 중',
  'auto.components.crash.report.CrashReportDialog.50b00dc327': '세부 정보 복사'
}

/** Keys that exist only in Prompt (English text is the translate() fallback in code). */
export const PROMPT_KO_ONLY_KEYS: Readonly<Record<string, string>> = {
  'prompt.settings.sidebarTitle': 'Prompt 설정',
  'prompt.about.menuLabel': '{{name}} 정보',
  'prompt.about.versionLine': '버전 {{version}} · 무료',
  'prompt.about.website': '웹사이트',
  'prompt.about.notices': '오픈소스 고지',
  'prompt.about.noticesMissing': '고지 파일을 읽을 수 없습니다.',
  'prompt.about.close': '닫기',
  'prompt.about.chromiumLicenses': 'Chromium 라이선스 열기',
  'prompt.timeAgo.now': '방금',
  'prompt.timeAgo.minutes': '{{value}}분',
  'prompt.timeAgo.hours': '{{value}}시간',
  'prompt.timeAgo.days': '{{value}}일',
  'prompt.crashReport.title': '크래시 신고',
  'prompt.crashReport.description':
    'GitHub에 새 이슈 화면을 엽니다. 적은 내용과 버전이 미리 채워지며, GitHub 계정이 필요합니다.',
  'prompt.crashReport.cancel': '취소',
  'prompt.crashReport.open': 'GitHub에서 열기',
  'prompt.crashReport.opened': 'GitHub 이슈 화면을 열었습니다. 거기서 등록해야 접수됩니다.'
}

/** Keys missing from upstream ko.json, translated for Prompt (P13). */
export const PROMPT_KO_FILL: Readonly<Record<string, string>> = promptKoFill

type LocaleOverrides = {
  /** Applied only where the upstream catalog has no value, so a later upstream translation wins. */
  fill: Readonly<Record<string, string>>
  /** Always applied. */
  replace: Readonly<Record<string, string>>
}

export const PROMPT_LOCALE_OVERRIDES: Readonly<Record<string, LocaleOverrides>> = {
  ko: {
    fill: PROMPT_KO_FILL,
    replace: { ...PROMPT_KO_WORDING, ...PROMPT_KO_ONLY_KEYS }
  }
}

type Catalog = Record<string, unknown>

function isCatalog(value: unknown): value is Catalog {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasValue(root: Catalog, key: string): boolean {
  let node: unknown = root
  for (const segment of key.split('.')) {
    if (!isCatalog(node)) {
      return false
    }
    node = node[segment]
  }
  return typeof node === 'string' && node !== ''
}

function setOverride(root: Catalog, key: string, value: string, copied: Set<Catalog>): void {
  const segments = key.split('.')
  const leaf = segments.pop() ?? key
  let node = root
  for (const segment of segments) {
    const child = node[segment]
    // Copy along the path once, so the loaded catalog object is never mutated.
    if (isCatalog(child) && copied.has(child)) {
      node = child
      continue
    }
    const next: Catalog = isCatalog(child) ? { ...child } : {}
    copied.add(next)
    node[segment] = next
    node = next
  }
  node[leaf] = value
}

export function applyPromptLocaleOverrides(language: string, catalog: Catalog): Catalog {
  const overrides = PROMPT_LOCALE_OVERRIDES[language]
  if (!overrides) {
    return catalog
  }
  const merged: Catalog = { ...catalog }
  const copied = new Set<Catalog>([merged])
  for (const [key, value] of Object.entries(overrides.fill)) {
    if (!hasValue(catalog, key)) {
      setOverride(merged, key, value, copied)
    }
  }
  for (const [key, value] of Object.entries(overrides.replace)) {
    setOverride(merged, key, value, copied)
  }
  return merged
}
