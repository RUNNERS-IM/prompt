import type React from 'react'
import { createContext, useContext } from 'react'
import { cn } from '@/lib/utils'
import { useAppStore } from '../../store'
import type { SettingsSearchEntry } from './settings-search'
import { matchesSettingsSearch } from './settings-search'
import { isPromptCardSection } from './prompt-settings-cards'
import {
  promptAbsorbedSettingsSectionOrder,
  promptSettingsHostSectionId,
  promptSettingsSectionCopy
} from '@/lib/prompt-hidden-settings'

// Share active section through context to avoid threading it through every section call.
const ActiveSettingsSectionContext = createContext<string | null>(null)

export const ActiveSettingsSectionProvider = ActiveSettingsSectionContext.Provider

type SettingsSectionProps = {
  id: string
  title: string
  description: React.ReactNode
  searchEntries?: SettingsSearchEntry[]
  children?: React.ReactNode
  className?: string
  bodyClassName?: string
  badge?: string
  badgeAccessory?: React.ReactNode
  forceVisible?: boolean
  /** Mount only the selected section, even when search lists several matches. */
  isActive?: boolean
  /** Header-scoped actions, such as Import from Ghostty. */
  headerAction?: React.ReactNode
  /** Drops the title block while the body shows its own page header (a plugin's page). */
  hideHeader?: boolean
  /** Click handler on the section title — the hook for hidden staff
   *  affordances (Option-click reveals), mirroring the Updates header. */
  onTitleClick?: (event: React.MouseEvent<HTMLHeadingElement>) => void
}

export function SettingsSection({
  id,
  title,
  description,
  searchEntries,
  children,
  className,
  bodyClassName,
  badge,
  badgeAccessory,
  forceVisible = false,
  isActive,
  headerAction,
  hideHeader = false,
  onTitleClick
}: SettingsSectionProps): React.JSX.Element | null {
  const query = useAppStore((state) => state.settingsSearchQuery)
  const activeFromContext = useContext(ActiveSettingsSectionContext)
  // Prompt: a section folded into another page shows below that page, without its own title.
  const absorbedOrder = promptAbsorbedSettingsSectionOrder(id)
  const absorbed = absorbedOrder !== undefined
  const sectionIsActive = isActive ?? activeFromContext === promptSettingsHostSectionId(id)
  const hasQuery = query.trim() !== ''
  // A folded section has no sidebar entry of its own; its rows filter themselves.
  const matchesQuery = absorbed || !searchEntries || matchesSettingsSearch(query, searchEntries)
  const promptCopy = promptSettingsSectionCopy(id)
  if (!forceVisible) {
    if (hasQuery) {
      if (!sectionIsActive || !matchesQuery) {
        return null
      }
    } else if (!sectionIsActive) {
      return null
    }
  }

  return (
    <section
      id={id}
      data-settings-section={id}
      data-prompt-absorbed-section={absorbed ? '' : undefined}
      style={absorbed ? { order: absorbedOrder } : undefined}
      className={cn('scroll-mt-8 space-y-6', className)}
    >
      <div
        hidden={hideHeader || absorbed}
        data-prompt-section-header=""
        className="flex items-start justify-between gap-4 border-b border-border/60 pb-5"
      >
        <div className="min-w-0 flex-1 space-y-2">
          <h2
            className="flex flex-wrap items-center gap-2 text-2xl font-semibold leading-tight text-foreground"
            onClick={onTitleClick}
          >
            {promptCopy?.title ?? title}
            {badge && !promptCopy ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
                {badge}
              </span>
            ) : null}
            {badgeAccessory}
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {promptCopy?.description ?? description}
          </p>
        </div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>
      {/* Contain row groups in a distinct band so they cannot read as sidebar continuations. */}
      <div
        data-prompt-cards={isPromptCardSection(id) ? '' : undefined}
        className={cn(
          'rounded-xl border border-border/50 bg-card/50 px-7 py-6 shadow-xs',
          bodyClassName
        )}
      >
        {children}
      </div>
    </section>
  )
}
