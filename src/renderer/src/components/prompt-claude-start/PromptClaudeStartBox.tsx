import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Chrome, CornerDownLeft, History, Zap, type LucideIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { ClaudeIcon } from '@/components/status-bar/icons'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { agentPermissionHostPlatform } from '../../../../shared/agent-permission-env'
import { ClaudeModelRadioGroup } from '../prompt-claude-model-menu'
import { formatTimeAgo } from '../right-sidebar/ai-vault-session-time'
import {
  buildPromptClaudeStartLaunch,
  promptClaudeSavedYolo,
  promptClaudeSwitchValue,
  PROMPT_CLAUDE_START_EFFORTS,
  PROMPT_CLAUDE_START_MODELS,
  PROMPT_CLAUDE_START_SWITCHES,
  type PromptClaudeStartChoices,
  type PromptClaudeStartEffort
} from './prompt-claude-start-launch'
import {
  promptClaudeStartProjectKey,
  readPromptClaudeStartChoices,
  startPromptClaudeFromBox,
  writePromptClaudeStartChoices
} from './prompt-claude-start-tabs'
import { usePromptClaudeResumeSessions } from './prompt-claude-start-resume'

const SWITCH_ICONS: Readonly<Record<string, LucideIcon>> = {
  chrome: Chrome,
  skipPermissions: Zap
}

function effortLabel(effort: PromptClaudeStartEffort | null): string {
  switch (effort) {
    case 'low':
      return translate('prompt.claudeStart.effortLevel.low', 'Low')
    case 'medium':
      return translate('prompt.claudeStart.effortLevel.medium', 'Medium')
    case 'high':
      return translate('prompt.claudeStart.effortLevel.high', 'High')
    case 'xhigh':
      return translate('prompt.claudeStart.effortLevel.xhigh', 'Extra high')
    case 'max':
      return translate('prompt.claudeStart.effortLevel.max', 'Max')
    default:
      return translate('prompt.claudeStart.default', 'Default')
  }
}

function shortenHome(path: string): string {
  return path.replace(/^(\/Users|\/home)\/[^/]+(?=\/|$)/, '~')
}

const PILL_CLASS =
  'inline-flex h-6 items-center gap-1 rounded-md bg-foreground/[0.08] px-2 text-xs text-foreground outline-none hover:bg-foreground/[0.12] focus-visible:ring-2 focus-visible:ring-ring/50'

/** The start box shown in a new Claude tab until Start (decision 1A). */
export function PromptClaudeStartBox({
  tabId,
  worktreeId,
  worktreePath,
  isActive
}: {
  tabId: string
  worktreeId: string
  worktreePath: string
  isActive: boolean
}): React.JSX.Element {
  useUiLanguageRevision()
  const settings = useAppStore((s) => s.settings)
  const context = useMemo(
    () => ({ savedYolo: promptClaudeSavedYolo(settings, agentPermissionHostPlatform()) }),
    [settings]
  )
  const projectKey = useMemo(() => promptClaudeStartProjectKey(worktreeId), [worktreeId])
  const [choices, setChoicesState] = useState<PromptClaudeStartChoices>(() =>
    readPromptClaudeStartChoices(projectKey)
  )
  const setChoices = useCallback(
    (update: (current: PromptClaudeStartChoices) => PromptClaudeStartChoices) => {
      setChoicesState((current) => {
        const next = update(current)
        writePromptClaudeStartChoices(projectKey, next)
        return next
      })
    },
    [projectKey]
  )
  const sessions = usePromptClaudeResumeSessions(worktreeId, worktreePath, true)
  const rootRef = useRef<HTMLDivElement>(null)
  const startingRef = useRef(false)

  useEffect(() => {
    if (isActive) {
      rootRef.current?.focus({ preventScroll: true })
    }
  }, [isActive])

  const start = useCallback(
    (resumeSessionId?: string) => {
      if (startingRef.current) {
        return
      }
      startingRef.current = true
      const launch = buildPromptClaudeStartLaunch({
        choices,
        context,
        settings,
        resumeSessionId
      })
      if (!startPromptClaudeFromBox({ tabId, worktreeId, launch })) {
        startingRef.current = false
      }
    },
    [choices, context, settings, tabId, worktreeId]
  )

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Enter' || event.defaultPrevented || event.nativeEvent.isComposing) {
      return
    }
    // Rows and menus answer Enter themselves; anywhere else in the box it starts.
    const target = event.target as HTMLElement
    if (target.closest('[data-claude-start-own-enter], [data-slot="dropdown-menu-trigger"]')) {
      return
    }
    event.preventDefault()
    start()
  }

  const modelLabel =
    PROMPT_CLAUDE_START_MODELS.find((model) => model.id === choices.model)?.label ??
    translate('prompt.claudeStart.default', 'Default')

  return (
    <div
      className="flex size-full items-center justify-center overflow-auto bg-card p-4"
      data-prompt-claude-start=""
    >
      <div
        ref={rootRef}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="w-full max-w-[500px] rounded-[14px] border border-border bg-popover p-4 text-[13px] text-popover-foreground shadow-[0_16px_48px_rgba(0,0,0,0.18)] outline-none dark:shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
      >
        <div className="mb-3 flex items-center gap-2">
          <ClaudeIcon size={14} />
          <span className="text-sm font-semibold">
            {translate('prompt.claudeStart.title', 'New Claude Session')}
          </span>
        </div>

        <div className="flex min-w-0 items-center gap-2 rounded-[10px] bg-foreground/[0.05] px-2.5 py-2">
          <span className="shrink-0 text-xs text-muted-foreground">
            {translate('prompt.claudeStart.model', 'Model')}
          </span>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button type="button" className={PILL_CLASS} data-prompt-claude-start-model="">
                {modelLabel}
                <ChevronDown className="size-3 opacity-60" strokeWidth={1.5} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <ClaudeModelRadioGroup
                value={choices.model ?? ''}
                defaultLabel={translate('prompt.claudeStart.default', 'Default')}
                onDefault={() => setChoices((current) => ({ ...current, model: null }))}
                onModelChange={(model) =>
                  setChoices((current) => ({ ...current, model: model.id }))
                }
              />
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="shrink-0 text-xs text-muted-foreground">
            {translate('prompt.claudeStart.thinking', 'Thinking')}
          </span>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button type="button" className={PILL_CLASS} data-prompt-claude-start-effort="">
                {effortLabel(choices.effort)}
                <ChevronDown className="size-3 opacity-60" strokeWidth={1.5} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={choices.effort ?? ''}
                onValueChange={(value) =>
                  setChoices((current) => ({
                    ...current,
                    effort: PROMPT_CLAUDE_START_EFFORTS.find((level) => level === value) ?? null
                  }))
                }
              >
                {[null, ...PROMPT_CLAUDE_START_EFFORTS].map((level) => (
                  <DropdownMenuRadioItem key={level ?? 'default'} value={level ?? ''}>
                    {effortLabel(level)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <span
            className="ml-auto min-w-0 truncate font-mono text-[11px] text-muted-foreground"
            title={worktreePath}
          >
            {shortenHome(worktreePath)}
          </span>
        </div>

        <div className="mt-3 divide-y divide-border overflow-hidden rounded-[10px] bg-foreground/[0.05]">
          {PROMPT_CLAUDE_START_SWITCHES.map((entry) => {
            const Icon = SWITCH_ICONS[entry.id]
            const checked = promptClaudeSwitchValue(choices, entry, context)
            const label = entry.label()
            return (
              <label
                key={entry.id}
                className="flex cursor-pointer items-center gap-2.5 px-2.5 py-2"
                data-prompt-claude-start-switch={entry.id}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground/[0.08] text-foreground/80">
                  {Icon ? <Icon className="size-[15px]" strokeWidth={1.5} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{label}</span>
                  <span className="block text-[11.5px] text-muted-foreground">
                    {entry.description()}
                  </span>
                </span>
                <Switch
                  checked={checked}
                  aria-label={label}
                  onCheckedChange={(on) =>
                    setChoices((current) => ({
                      ...current,
                      switches: { ...current.switches, [entry.id]: on }
                    }))
                  }
                />
              </label>
            )
          })}
        </div>

        <button
          type="button"
          onClick={() => start()}
          data-claude-start-own-enter=""
          data-prompt-claude-start-new=""
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--prompt-accent)] py-2 text-[13px] font-semibold text-white outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {translate('prompt.claudeStart.start', 'Start New')}
          <kbd className="inline-flex items-center rounded bg-white/20 px-1 py-px">
            <CornerDownLeft className="size-3" strokeWidth={1.5} />
          </kbd>
        </button>

        {sessions.length > 0 ? (
          <div className="mt-3" data-prompt-claude-start-resume="">
            <div className="mx-1 mb-1 text-[11px] tracking-[0.02em] text-muted-foreground">
              {translate('prompt.claudeStart.resume', 'Resume')}
            </div>
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                data-claude-start-own-enter=""
                onClick={() => start(session.sessionId)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-foreground/90 outline-none hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.06]"
                title={session.title}
              >
                <History className="size-[15px] shrink-0" strokeWidth={1.5} />
                <span className="min-w-0 flex-1 truncate">
                  {session.title.trim() || session.sessionId.slice(0, 8)}
                </span>
                <span className="shrink-0 text-[11.5px] text-muted-foreground">
                  {formatTimeAgo(Date.parse(session.modifiedAt))}
                </span>
              </button>
            ))}
            <button
              type="button"
              data-claude-start-own-enter=""
              onClick={() => {
                const state = useAppStore.getState()
                state.setRightSidebarTab('vault')
                state.setRightSidebarOpen(true)
              }}
              className={cn(
                'w-full rounded-md py-1.5 pr-2 pl-[31px] text-left text-muted-foreground outline-none',
                'hover:bg-foreground/[0.06] hover:text-foreground focus-visible:bg-foreground/[0.06]'
              )}
            >
              {translate('prompt.claudeStart.showAll', 'Show all…')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
