import React from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, ClipboardCheck } from 'lucide-react'
import { absolutePathToFileUri } from '@/components/editor/markdown-internal-links'
import { translate } from '@/i18n/i18n'
import { formatUiRelativeTime } from '@/i18n/relative-time-format'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { openPromptDecisionDraft } from './prompt-decision-draft-open'
import {
  refreshPromptDecisionDrafts,
  usePromptDecisionDrafts,
  loadPromptDecisionDrafts
} from './prompt-decision-inbox-store'

const COLLAPSED_STORAGE_KEY = 'prompt.decisionInbox.collapsed'

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0')
  } catch {
    // Only the remembered fold is lost.
  }
}

function draftAge(modifiedAt: number): string {
  return formatUiRelativeTime(modifiedAt - Date.now())
}

function useActiveBrowserUrl(): string | null {
  return useAppStore((state) => {
    const worktreeId = state.activeWorktreeId
    if (!worktreeId || state.activeTabType !== 'browser') {
      return null
    }
    const workspaceId = state.activeBrowserTabIdByWorktree[worktreeId]
    return (
      state.browserTabsByWorktree[worktreeId]?.find((workspace) => workspace.id === workspaceId)
        ?.url ?? null
    )
  })
}

/** The pages waiting for this person's answer, pinned under the session list and hidden when none wait. */
const PromptDecisionInboxSection = React.memo(function PromptDecisionInboxSection() {
  // Own language subscription: this memo boundary would otherwise keep the boot language.
  useTranslation()
  const drafts = usePromptDecisionDrafts()
  const activeBrowserUrl = useActiveBrowserUrl()
  const [collapsed, setCollapsed] = React.useState(readCollapsed)

  React.useEffect(() => {
    void loadPromptDecisionDrafts()
    const refresh = (): void => void refreshPromptDecisionDrafts()
    const unsubscribe = window.api.promptDecisionInbox?.onChanged(refresh)
    window.addEventListener('focus', refresh)
    return () => {
      unsubscribe?.()
      window.removeEventListener('focus', refresh)
    }
  }, [])

  if (drafts.length === 0) {
    return null
  }
  const Chevron = collapsed ? ChevronRight : ChevronDown
  return (
    <section
      data-testid="prompt-decision-inbox"
      className="shrink-0 border-t border-worktree-sidebar-border px-2 py-1"
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={() => {
          writeCollapsed(!collapsed)
          setCollapsed(!collapsed)
        }}
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-[12px] font-medium text-worktree-sidebar-foreground/70 hover:bg-worktree-sidebar-accent/60"
      >
        <Chevron className="size-3.5" />
        <span className="flex-1 text-left">
          {translate('prompt.decisionInbox.title', 'Decisions')}
        </span>
        <span className="rounded-full bg-worktree-sidebar-foreground/10 px-1.5 text-[11px] font-medium tabular-nums">
          {drafts.length}
        </span>
      </button>
      {collapsed ? null : (
        <div className="scrollbar-sleek max-h-[204px] overflow-y-auto">
          {drafts.map((draft) => (
            <button
              type="button"
              key={draft.filePath}
              onClick={() => openPromptDecisionDraft(draft)}
              className={cn(
                'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-worktree-sidebar-accent/60',
                absolutePathToFileUri(draft.filePath) === activeBrowserUrl &&
                  'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
              )}
            >
              <ClipboardCheck
                className="mt-0.5 size-3.5 shrink-0 text-worktree-sidebar-foreground/50"
                strokeWidth={1.75}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium tracking-tight text-worktree-sidebar-foreground">
                  {draft.topic}
                </div>
                <div className="truncate text-[11px] text-worktree-sidebar-foreground/55">
                  {draft.sessionName} · {draftAge(draft.modifiedAt)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  )
})

export default PromptDecisionInboxSection
