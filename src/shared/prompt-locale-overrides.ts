import promptKoFill from './prompt-ko-fill.json'
import promptKoSettingsWording from './prompt-ko-settings-wording.json'

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
  // Settings window wording (kept in JSON so this file stays readable).
  ...promptKoSettingsWording,
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
  'auto.components.crash.report.CrashReportDialog.50b00dc327': '세부 정보 복사',
  // Update card and status bar show the real version (2.6.110501), without "v".
  'auto.components.UpdateCard.93794ea932': 'Prompt {{value0}} 받는 중입니다.',
  'auto.components.UpdateCard.558842597d': '업데이트 받는 중',
  'auto.components.UpdateCard.downloadingPercent': '받는 중… {{percent}}%',
  'updates.installBlock.preparingSummary':
    '다시 시작하기 전에 실행 중인 다른 Prompt 를 확인하는 중입니다.',
  'auto.components.status.bar.UpdateStatusSegment.248ee5d8ef':
    'Prompt {{value0}} 받는 중… {{value1}}%',
  'auto.components.status.bar.UpdateStatusSegment.9d13213a56': 'Prompt {{value0}} 설치 준비됨',
  // Help menu: "…" only on items that open a window.
  'menu.reportCrash': '크래시 신고…',
  'auto.components.setup.guide.SetupGuideModal.3598a3ca0c':
    'Orca를 병렬 에이전트 작업에 유용하게 만드는 핵심 워크플로를 완료합니다.',
  // App menu: same wording as the menu bar menu (업데이트 확인…, 설정…).
  'menu.checkForUpdates': '업데이트 확인…',
  'menu.settings': '설정…',
  'menu.quitAndStopAllSessions': '완전히 종료…',
  // Close window / Quit Completely: "~할까요?" titles, one or two sentence explanations.
  'auto.components.Terminal.2fa9c69ff3': '창을 닫을까요?',
  'auto.components.Terminal.7958465754': '명령이 실행 중인 터미널이 있습니다.',
  'auto.components.Terminal.b7c1f0a934':
    '원격 호스트에 연결할 수 없어 그곳에서 작업이 실행 중인지 알 수 없습니다.',
  'quitAndStopAllSessions.message': '모든 터미널 세션을 멈추고 Orca를 종료할까요?',
  'quitAndStopAllSessions.detail':
    '실행 중인 에이전트를 포함해 모든 터미널 세션이 멈추고, 닫힌 탭은 다음에 다시 열리지 않습니다. 그냥 종료하면 세션은 계속 돌아갑니다.'
  // Settings redesign: Prompt instead of Orca, Korean where the catalog left English.
}

/** Keys that exist only in Prompt (English text is the translate() fallback in code). */
export const PROMPT_KO_ONLY_KEYS: Readonly<Record<string, string>> = {
  'prompt.settings.sidebarTitle': 'Prompt 설정',
  'prompt.settings.group.more': '더 보기',
  'prompt.settings.appearance.title': '모양',
  'prompt.settings.appearance.description': '테마, 언어, 화면 크기, 글꼴, 터미널 색을 정합니다.',
  'prompt.skills.mySkills': '내 스킬',
  'prompt.skills.commands': '명령어',
  'prompt.skills.commandCount': '명령어 {{count}}개',
  'prompt.settings.cli.notInstalled': '다른 터미널에서도 쓰려면 {{path}} 를 등록합니다.',
  'prompt.settings.claude.title': 'Claude',
  'prompt.settings.claude.description': 'Claude 계정, 새 세션을 시작하는 방식, 사용량을 정합니다.',
  'prompt.settings.git.title': 'Git',
  'prompt.settings.git.description': '브랜치, 소스 제어 작업, GitHub · GitLab 연결을 정합니다.',
  'prompt.settings.advanced.title': '고급',
  'prompt.settings.advanced.description': '네트워크, macOS 권한, 세션 검색, 실험 기능을 정합니다.',
  'prompt.settings.advanced.descriptionNoPermissions': '네트워크, 세션 검색, 실험 기능을 정합니다.',
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
  'prompt.crashReport.opened': 'GitHub 이슈 화면을 열었습니다. 거기서 등록해야 접수됩니다.',
  'prompt.update.titleVersion': '새 버전 {{version}}',
  'prompt.update.subtitleWithCurrent': '지금 {{current}} · 설치하면 Prompt가 다시 시작됩니다',
  'prompt.update.subtitle': '설치하면 Prompt가 다시 시작됩니다',
  'prompt.update.releaseNotes': '바뀐 점 보기',
  'prompt.update.dismiss': '닫기',
  'prompt.update.downloadingTitle': '새 버전 {{version}} 받는 중',
  'prompt.update.downloadingSubtitle': '다 받으면 Prompt가 다시 시작됩니다',
  'prompt.update.later': '나중에',
  'prompt.update.install': '설치',
  'prompt.update.restartFailed':
    '업데이트를 설치하려고 다시 시작하지 못했습니다. Prompt를 종료했다가 다시 연 뒤 시도하세요.',
  'prompt.update.installerFailed':
    '업데이트 설치 프로그램을 시작하지 못했습니다. Prompt는 그대로 열려 있습니다.',
  // Terminal link hover hints (terminal-link-open-hints.ts); {{mod}} is ⌘ or Ctrl.
  'prompt.terminalLinkHint.actionsPrefix': '클릭: 동작 메뉴 · ',
  'prompt.terminalLinkHint.actionsOrPrefix': '클릭: 동작 메뉴 · ',
  'prompt.terminalLinkHint.fileOpen': '{{mod}}+클릭: 열기 · {{shiftMod}}+클릭: 기본 앱으로 열기',
  'prompt.terminalLinkHint.orcaFileOpen': '{{mod}}+클릭: Prompt 에서 열기',
  'prompt.terminalLinkHint.urlInvertsToOrca':
    '{{mod}}+클릭: 열기 · {{shiftMod}}+클릭: Prompt 에서 열기',
  'prompt.terminalLinkHint.urlSystemBrowser':
    '{{mod}}+클릭: 열기 · {{shiftMod}}+클릭: 기본 브라우저로 열기',
  'prompt.terminalLinkHint.systemBrowserOnly': '{{shiftMod}}+클릭: 기본 브라우저로 열기',
  'prompt.terminalLinkHint.clickSystemBrowser': '클릭: 기본 브라우저로 열기',
  'prompt.terminalLinkHint.orcaBrowserOnly': '{{shiftMod}}+클릭: Prompt 에서 열기',
  'prompt.terminalLinkHint.switchWorkspace': '{{mod}}+클릭: 이 워크스페이스로 이동',
  'prompt.terminalLinkHint.switchWorkspaceFinder':
    '{{mod}}+클릭: 이 워크스페이스로 이동 · {{shiftMod}}+클릭: Finder 에서 열기',
  'prompt.terminalLinkHint.switchWorkspaceFolder':
    '{{mod}}+클릭: 이 워크스페이스로 이동 · {{shiftMod}}+클릭: 폴더 열기',
  // Notices written into a terminal (prompt-terminal-notice-copy.ts).
  'prompt.terminalNotice.hiddenBacklog':
    '출력이 너무 많이 쌓여서, 화면에 안 보이던 동안의 터미널 출력 일부를 건너뛰었습니다.',
  'prompt.terminalNotice.foregroundBurst':
    '출력이 한꺼번에 너무 많이 들어와서 터미널 출력 일부를 건너뛰었습니다.',
  'prompt.terminalNotice.restoreUnavailable':
    '화면에 안 보이던 동안의 터미널 출력을 되살릴 수 없어 건너뛰었습니다.',
  'prompt.terminalNotice.noHostImage': '이 터미널의 지난 출력을 호스트에서 되살리지 못했습니다.',
  // Settings redesign: group titles and copy of the merged pages.
  'prompt.settings.claude.accountsGroup': '계정',
  'prompt.settings.claude.launchGroup': '새 세션',
  'prompt.settings.claude.permissionDescription': 'Claude 가 묻지 않고 할 수 있는 일입니다.',
  'prompt.settings.claude.sessionGroup': 'Claude 세션',
  'prompt.settings.claude.usageGroup': '사용량',
  'prompt.settings.claude.usageSearchDescription':
    '에이전트 횟수와 Claude 토큰 · 모델 · 세션 사용량.',
  'prompt.settings.cli.installDescriptionMac':
    '`prompt` 와 `orca` 를 /usr/local/bin 에 등록합니다.',
  'prompt.settings.general.appGroup': '앱',
  'prompt.settings.general.openAtLoginDescription':
    '맥에 로그인하면 Prompt 를 메뉴 막대에 띄워 둡니다.',
  'prompt.settings.general.autoCheckUpdatesDescription': '새 판이 나오면 알려 줍니다.',
  'prompt.settings.general.menuBarIconDescription': '메뉴 막대에 Prompt 아이콘을 보입니다.',
  'prompt.settings.account.title': '계정',
  'prompt.settings.account.description': 'RUNNERS 앱들이 함께 쓰는 RUNNERS 계정 하나입니다.',
  'prompt.settings.about.title': '정보',
  'prompt.settings.about.description': '버전, RUNNERS 앱, 오픈소스 고지.',
  'prompt.settings.appearance.trayGroup': '시스템 트레이',
  'prompt.settings.appearance.terminalWindowGroup': '터미널 창',
  'prompt.settings.terminal.scrollbackKeysGroup': '스크롤 · 키 입력',
  'prompt.settings.terminal.shellArgsGroup': '셸 시작 인수',
  'prompt.settings.notifications.alertsGroup': '알림',
  'prompt.settings.notifications.soundGroup': '소리',
  'prompt.settings.notifications.visibleScreenGroup': '보이는 화면',
  'prompt.settings.git.branchesGroup': '브랜치와 작업 공간',
  'prompt.settings.git.apiBudgetGroup': 'API 사용 한도',
  'prompt.settings.git.integrationsGroup': '연동',
  'prompt.settings.advanced.permissionsGroup': 'macOS 권한',
  'prompt.settings.advanced.sessionSearchGroup': '에이전트 세션 검색',
  'prompt.settings.advanced.experimentalGroup': '실험 기능'
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
