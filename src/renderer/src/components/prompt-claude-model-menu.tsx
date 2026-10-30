import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { getPtyIdForPaneKey } from '@/hooks/pane-key-pty-id'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from '@/lib/close-all-context-menus'
import { translate } from '@/i18n/i18n'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { CLAUDE_SESSION_OPTION_CATALOG } from '../../../shared/agent-session-option-catalog-claude-codex'
import type { CatalogModel } from '../../../shared/agent-session-option-catalog-types'
import { matchNativeChatCatalogModelId } from '../../../shared/native-chat/input/native-chat-session-option-state'
import { isTerminalLeafId, makePaneKey, parsePaneKey } from '../../../shared/stable-pane-id'
import type { DashboardAgentRow } from './dashboard/useDashboardData'
import { sendNativeChatMessageVerified } from './native-chat/native-chat-runtime-send'
import { createClaudeModelSwitchConfirmationObserver } from './native-chat/claude-model-switch-confirmation'
import { usePromptVisibleModelLabel } from './prompt-session-card/prompt-default-model'

const CLAUDE_MODELS = CLAUDE_SESSION_OPTION_CATALOG.models

function currentClaudeModelId(reported: string | undefined): string {
  return reported
    ? (matchNativeChatCatalogModelId(CLAUDE_SESSION_OPTION_CATALOG, reported) ?? '')
    : ''
}

/** Types `/model <id>` into the pane's Claude TUI and answers its cached-history confirmation like native chat does. */
async function switchClaudePaneModel(paneKey: string, model: CatalogModel): Promise<void> {
  const ptyId = getPtyIdForPaneKey(paneKey)
  if (!ptyId) {
    toast.error(
      translate(
        'components.native-chat.sessionOption.noLiveTerminal',
        'No live terminal is available.'
      )
    )
    return
  }
  const observer = createClaudeModelSwitchConfirmationObserver({
    ptyId,
    expectedModelLabel: model.label
  })
  try {
    await observer.ready
    observer.arm()
    if (!(await sendNativeChatMessageVerified(ptyId, `/model ${model.id}`))) {
      toast.error(
        translate(
          'components.native-chat.sessionOption.commandRejected',
          'The terminal did not accept the command.'
        )
      )
      return
    }
    observer.startDetection()
    if ((await observer.result) === 'rejected') {
      toast.error(translate('prompt.claudeModel.rejected', 'Claude kept the previous model.'))
    }
  } finally {
    observer.dispose()
  }
}

// Menu events bubble through the React tree into rows and tabs that activate or drag on them.
const stopMenuEvent = (event: React.SyntheticEvent): void => event.stopPropagation()
const MENU_EVENT_GUARDS = {
  onClick: stopMenuEvent,
  onPointerDown: stopMenuEvent,
  onPointerUp: stopMenuEvent,
  onMouseDown: stopMenuEvent,
  onMouseUp: stopMenuEvent,
  onDoubleClick: stopMenuEvent,
  onContextMenu: stopMenuEvent
}

function ClaudeModelRadioItems({
  paneKey,
  reportedModel
}: {
  paneKey: string
  reportedModel: string | undefined
}): React.JSX.Element {
  return (
    <DropdownMenuRadioGroup
      value={currentClaudeModelId(reportedModel)}
      onValueChange={(id) => {
        const model = CLAUDE_MODELS.find((candidate) => candidate.id === id)
        if (model) {
          void switchClaudePaneModel(paneKey, model)
        }
      }}
    >
      {CLAUDE_MODELS.map((model) => (
        <DropdownMenuRadioItem key={model.id} value={model.id} title={model.description}>
          {model.label}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  )
}

function useCloseOnGlobalMenuEvent(open: boolean, setOpen: (open: boolean) => void): void {
  useEffect(() => {
    if (!open) {
      return
    }
    const close = (): void => setOpen(false)
    window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, close)
    return () => window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, close)
  }, [open, setOpen])
}

function offersClaudeModelMenu(agent: DashboardAgentRow): boolean {
  // Retained rows outlive Claude, so typing /model there would reach the shell instead.
  return (
    agent.agentType === 'claude' &&
    (agent.rowSource ?? 'live') === 'live' &&
    parsePaneKey(agent.paneKey) !== null
  )
}

/** Marks a live Claude row; the workspace context menu reads it to add "Model ▸" on top. */
export const PROMPT_CLAUDE_MODEL_PANE_ATTR = 'data-prompt-claude-model-pane'

/** Pane key of the live Claude row a right-click landed in, or null. */
export function claudeModelPaneKeyFromTarget(target: EventTarget | null): string | null {
  const element = target as { closest?: (selector: string) => Element | null } | null
  return (
    element
      ?.closest?.(`[${PROMPT_CLAUDE_MODEL_PANE_ATTR}]`)
      ?.getAttribute(PROMPT_CLAUDE_MODEL_PANE_ATTR) ?? null
  )
}

/** "Model ▸" submenu plus a separator, placed first in an existing context menu. Renders nothing when the pane is not a Claude session. */
export function PromptClaudeModelSubmenu({
  paneKey
}: {
  paneKey: string | null
}): React.JSX.Element | null {
  useUiLanguageRevision()
  const entry = useAppStore((s) => (paneKey ? s.agentStatusByPaneKey?.[paneKey] : undefined))
  if (!paneKey || entry?.agentType !== 'claude') {
    return null
  }
  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          {translate('prompt.claudeModel.submenu', 'Model')}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <ClaudeModelRadioItems paneKey={paneKey} reportedModel={entry.model?.trim()} />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
    </>
  )
}

/** Tab variant: the submenu targets the tab's focused pane. */
export function PromptClaudeTabModelSubmenu({ tabId }: { tabId: string }): React.JSX.Element {
  const paneKey = useAppStore((s) => {
    const leafId = s.terminalLayoutsByTabId?.[tabId]?.activeLeafId
    return leafId && isTerminalLeafId(leafId) ? makePaneKey(tabId, leafId) : null
  })
  return <PromptClaudeModelSubmenu paneKey={paneKey} />
}

/** Marks live Claude rows so right-click keeps the workspace menu and adds "Model ▸" first. */
export function PromptClaudeModelRowMenu({
  agent,
  children
}: {
  agent: DashboardAgentRow
  children: React.ReactNode
}): React.JSX.Element {
  if (!offersClaudeModelMenu(agent)) {
    return <>{children}</>
  }
  return (
    <div className="contents" {...{ [PROMPT_CLAUDE_MODEL_PANE_ATTR]: agent.paneKey }}>
      {children}
    </div>
  )
}

/** Small mono badge beside a terminal tab title when the focused pane's Claude model is not the default. */
export function PromptClaudeModelTabBadge({ tabId }: { tabId: string }): React.JSX.Element | null {
  useUiLanguageRevision()
  const [open, setOpen] = useState(false)
  useCloseOnGlobalMenuEvent(open, setOpen)
  const paneKey = useAppStore((s) => {
    const leafId = s.terminalLayoutsByTabId[tabId]?.activeLeafId
    return leafId && isTerminalLeafId(leafId) ? makePaneKey(tabId, leafId) : null
  })
  const model = useAppStore((s) => {
    const entry = paneKey ? s.agentStatusByPaneKey[paneKey] : undefined
    return entry?.agentType === 'claude' ? (entry.model?.trim() ?? '') : ''
  })
  // The default model would only repeat on every tab; the tab's right-click menu still switches it.
  const shownModel = usePromptVisibleModelLabel(model)
  if (!paneKey || !shownModel) {
    return null
  }
  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'mr-1 min-w-0 max-w-[4.5rem] shrink-[2] truncate rounded-sm px-1 font-mono text-[10px] leading-4',
            'text-muted-foreground/70 hover:bg-accent hover:text-foreground'
          )}
          title={translate('prompt.claudeModel.badgeTitle', 'Model: {{model}} (click to change)', {
            model
          })}
          {...MENU_EVENT_GUARDS}
        >
          {model}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" {...MENU_EVENT_GUARDS}>
        <ClaudeModelRadioItems paneKey={paneKey} reportedModel={model} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Wraps an agent row component so live Claude rows get the right-click model menu. */
export function withPromptClaudeModelRowMenu<P extends { agent: DashboardAgentRow }>(
  Row: React.ComponentType<P>
): React.ComponentType<P> {
  return function PromptClaudeModelMenuRow(props: P): React.JSX.Element {
    return (
      <PromptClaudeModelRowMenu agent={props.agent}>
        <Row {...props} />
      </PromptClaudeModelRowMenu>
    )
  }
}
