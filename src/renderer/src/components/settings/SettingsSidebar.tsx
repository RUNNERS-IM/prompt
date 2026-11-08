import type { CSSProperties, RefObject } from 'react'
import { useMemo } from 'react'
import { ArrowLeft, Search, Server } from 'lucide-react'
import type { RepoIcon } from '../../../../shared/repo-icon'
import type { SettingsNavIcon, SettingsNavInstallStatus } from '@/lib/settings-navigation-types'
import type { GitHubRepositoryIdentity } from '../../../../shared/github/pull-request-types'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { useShortcutKeyComboDetails } from '@/hooks/useShortcutLabel'
import { ShortcutKeyCombo } from '../ShortcutKeyCombo'
import { cn } from '@/lib/utils'
import { RepoIconGlyph } from '../repo/repo-icon'
import { RepoForkIndicator } from '../repo/repo-fork-indicator'
import { Input } from '../ui/input'
import { SetupGuideProgressRing } from '../setup-guide/SetupGuideProgressRing'
import { useSettingsSetupGuideProgress } from './settings-setup-guide-progress'
import type { SettingsSetupGuideProgress } from './settings-setup-guide-progress'
import { translate } from '@/i18n/i18n'
import { resolveLeftSidebarStyleVariables } from '@/lib/left-sidebar-appearance'
import { useSystemPrefersDark } from '../terminal-pane/use-system-prefers-dark'
import { useAppStore } from '@/store'
import { PROMPT_SIMPLE_SETTINGS } from '@/lib/prompt-hidden-settings'

type NavSection = {
  id: string
  title: string
  icon: SettingsNavIcon
  badge?: string
  installStatus?: SettingsNavInstallStatus
}

type NavGroup = {
  id: string
  title: string
  sections: NavSection[]
}

type RepoNavSection = NavSection & {
  badgeColor?: string
  isRemote?: boolean
  repoIcon?: RepoIcon | null
  upstream?: GitHubRepositoryIdentity | null
}

type SettingsSidebarProps = {
  activeSectionId: string
  settings: GlobalSettings | null
  generalGroups: NavGroup[]
  repoSections: RepoNavSection[]
  hasRepos: boolean
  searchInputRef?: RefObject<HTMLInputElement | null>
  searchAutoFocus?: boolean
  onBack: () => void
  onSelectSection: (sectionId: string) => void
}

function SettingsSearchField({
  searchInputRef,
  searchAutoFocus = false
}: Pick<SettingsSidebarProps, 'searchInputRef' | 'searchAutoFocus'>): React.JSX.Element {
  const searchQuery = useAppStore((state) => state.settingsSearchInputQuery)
  const onSearchChange = useAppStore((state) => state.setSettingsSearchQuery)
  const searchShortcutCombos = useShortcutKeyComboDetails('settings.search')

  return (
    <div className="px-2.5 pb-2">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-worktree-sidebar-foreground/50" />
        <Input
          ref={searchInputRef}
          autoFocus={searchAutoFocus}
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={translate(
            'auto.components.settings.SettingsSidebar.dbceaa8840',
            'Search settings'
          )}
          // Same borderless pill as the search row at the top of the app sidebar.
          className="h-9 rounded-full border-0 bg-worktree-sidebar-foreground/9 ps-9 pe-14 text-[13px] shadow-none md:text-[13px] placeholder:text-worktree-sidebar-foreground/50 dark:bg-worktree-sidebar-foreground/9"
        />
        {searchQuery === '' ? (
          <span className="pointer-events-none absolute end-2 top-1/2 flex -translate-y-1/2 items-center">
            {searchShortcutCombos.map((combo) => (
              <ShortcutKeyCombo
                key={combo.keys.join('-')}
                keys={combo.keys}
                doubleTap={combo.doubleTap}
                className="inline-flex gap-0.5"
                separatorClassName="text-[10px] text-muted-foreground"
              />
            ))}
          </span>
        ) : null}
      </div>
    </div>
  )
}

type VisibleInstallStatus = Extract<
  SettingsNavInstallStatus,
  'update-available' | 'needs-attention'
>

function isVisibleInstallStatus(
  status: SettingsNavInstallStatus | undefined
): status is VisibleInstallStatus {
  return status === 'update-available' || status === 'needs-attention'
}

type SettingsSetupGuideRowProps = {
  progress: SettingsSetupGuideProgress
  setupActive: boolean
  onSelect: () => void
}

function SettingsSetupGuideNavRow({
  progress,
  setupActive,
  onSelect
}: SettingsSetupGuideRowProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-current={setupActive ? 'page' : undefined}
      aria-label={translate(
        'auto.components.settings.SettingsSidebar.82db1b7de4',
        'Onboarding checklist, {{value0}} of {{value1}} done. Show setup guide.',
        { value0: progress.doneCount, value1: progress.total }
      )}
      onClick={() => onSelect()}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-worktree-sidebar-ring/50',
        setupActive
          ? 'bg-worktree-sidebar-accent font-medium text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8 hover:text-worktree-sidebar-foreground'
      )}
    >
      <SetupGuideProgressRing
        done={progress.doneCount}
        total={progress.total}
        sizeClassName="size-4"
        tooltipLabel={`${progress.doneCount}/${progress.total} complete`}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-medium leading-4">
          {translate('auto.components.settings.SettingsSidebar.6503182299', 'Onboarding checklist')}
        </span>
      </span>
    </button>
  )
}

export function SettingsSidebar({
  activeSectionId,
  settings,
  generalGroups,
  repoSections,
  hasRepos,
  searchInputRef,
  searchAutoFocus = false,
  onBack,
  onSelectSection
}: SettingsSidebarProps): React.JSX.Element {
  const setupGuideProgress = useSettingsSetupGuideProgress(true)
  const systemPrefersDark = useSystemPrefersDark()
  const leftSidebarStyle = useMemo(
    () => resolveLeftSidebarStyleVariables(settings, systemPrefersDark),
    [settings, systemPrefersDark]
  ) as CSSProperties | undefined
  const setupActive = activeSectionId === 'setup-guide'
  // Hiding the app-sidebar prompt must not remove Settings’ stable checklist entry.
  // Prompt: no onboarding checklist; its steps repeat other pages.
  const showSetupGuideTopRow =
    !PROMPT_SIMPLE_SETTINGS &&
    setupGuideProgress.ready &&
    setupGuideProgress.doneCount < setupGuideProgress.total
  const navItemClassName = (isActive: boolean): string =>
    cn(
      // Rows as the app sidebar's top rows: 36 high, corner 6, 13 medium, text 88%, icons 70%.
      'flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-worktree-sidebar-ring/50 [&>svg]:text-worktree-sidebar-foreground/70',
      isActive
        ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
        : 'text-worktree-sidebar-foreground/88 hover:bg-worktree-sidebar-accent/60 hover:text-worktree-sidebar-foreground'
    )
  const installStatusLabel = (status: VisibleInstallStatus): string => {
    switch (status) {
      case 'update-available':
        return translate(
          'auto.components.skills.SkillFreshnessStatusPill.updateAvailable',
          'Update available'
        )
      case 'needs-attention':
        return translate(
          'auto.components.skills.SkillFreshnessStatusPill.needsAttention',
          'Review skill'
        )
    }
  }
  const installStatusClassName =
    'ms-auto shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-amber-700 dark:text-amber-300'

  return (
    <aside
      className="flex w-[280px] shrink-0 flex-col bg-worktree-sidebar"
      style={leftSidebarStyle}
      data-prompt-settings-sidebar=""
    >
      <div className="space-y-2 px-2.5 pb-2 pt-3">
        <h1 className="px-2.5 text-base font-bold text-foreground">
          {translate('prompt.settings.sidebarTitle', 'Prompt Settings')}
        </h1>
        <button type="button" onClick={onBack} className={navItemClassName(false)}>
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" />
          {translate('auto.components.settings.SettingsSidebar.60f8a673a7', 'Back to app')}
        </button>
      </div>

      <SettingsSearchField searchInputRef={searchInputRef} searchAutoFocus={searchAutoFocus} />

      {showSetupGuideTopRow ? (
        <div className="border-b border-worktree-sidebar-border px-3 py-3">
          <SettingsSetupGuideNavRow
            progress={setupGuideProgress}
            setupActive={setupActive}
            onSelect={() => onSelectSection('setup-guide')}
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek px-2.5 pb-4 pt-2">
        <div className="space-y-4">
          {generalGroups.map((group) => (
            <div key={group.id} className="space-y-1">
              <p className="px-2.5 text-2xs font-semibold text-muted-foreground">{group.title}</p>
              <div className="space-y-0.5">
                {group.sections
                  .filter((section) => section.id !== 'setup-guide')
                  .map((section) => {
                    const Icon = section.icon
                    const isActive = activeSectionId === section.id

                    return (
                      <button
                        key={section.id}
                        aria-current={isActive ? 'page' : undefined}
                        data-current={isActive ? 'true' : undefined}
                        onClick={() => onSelectSection(section.id)}
                        className={navItemClassName(isActive)}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="truncate">{section.title}</span>
                        {isVisibleInstallStatus(section.installStatus) ? (
                          <span className={installStatusClassName}>
                            {installStatusLabel(section.installStatus)}
                          </span>
                        ) : section.badge ? (
                          <span className="ms-auto rounded-full bg-muted px-1.5 py-0.5 text-3xs font-medium text-muted-foreground">
                            {section.badge}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
              </div>
            </div>
          ))}

          <div className="space-y-1">
            <p className="px-2.5 text-2xs font-semibold text-muted-foreground">
              {translate('auto.components.settings.SettingsSidebar.5c9669ff9c', 'Projects')}
            </p>

            {repoSections.length > 0 ? (
              <div className="space-y-0.5">
                {repoSections.map((section) => {
                  const isActive = activeSectionId === section.id

                  return (
                    <button
                      key={section.id}
                      aria-current={isActive ? 'page' : undefined}
                      data-current={isActive ? 'true' : undefined}
                      onClick={() => onSelectSection(section.id)}
                      className={navItemClassName(isActive)}
                    >
                      <RepoIconGlyph
                        repoIcon={section.repoIcon}
                        color={section.badgeColor}
                        className="size-4 shrink-0 text-muted-foreground"
                        iconClassName="size-3.5"
                      />
                      <span className="truncate">{section.title}</span>
                      <RepoForkIndicator upstream={section.upstream} />
                      {section.isRemote && (
                        <span className="ms-auto inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                          <Server className="size-3" />
                          {translate('auto.components.settings.SettingsSidebar.e0900f83e7', 'SSH')}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="px-2.5 text-2xs text-muted-foreground">
                {hasRepos
                  ? translate(
                      'auto.components.settings.SettingsSidebar.3e483e256b',
                      'No matching project settings.'
                    )
                  : translate(
                      'auto.components.settings.SettingsSidebar.df38d612b7',
                      'No projects added yet.'
                    )}
              </p>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
