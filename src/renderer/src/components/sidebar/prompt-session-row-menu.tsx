import React, { useCallback, useEffect, useState } from 'react'
import { Copy, Layers, Pencil, X } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { useOptionalShortcutLabel } from '@/hooks/useShortcutLabel'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from '@/lib/close-all-context-menus'
import { TAB_COLORS } from '@/components/tab-bar/tab-colors'
import { PromptClaudeModelSubmenu } from '@/components/prompt-claude-model-menu'
import { WORKTREE_CONTEXT_MENU_SCOPE_ATTR } from './worktree-context-menu-policy'
import { openPromptSessionCopyWindow } from '@/lib/prompt-windows'
import { promptClaudeSessionCopyCommand } from '../../../../shared/prompt-windows'
import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import { promptNewSessionLabel, promptSessionTabName } from './prompt-session-row-name'
import { closePromptSession, setPromptSessionColor } from './prompt-sidebar-session-actions'
import { PromptSessionRowRename } from './prompt-session-row-rename'

/** Hover group shared by a session row's time and its × (they swap places, decision 2A). */
export const PROMPT_SESSION_ROW_GROUP_CLASS = 'group/prompt-session-row'
/** The row's time steps aside while the pointer is on the row, and the × takes its place. */
export const PROMPT_SESSION_TIME_HOVER_CLASS = 'group-hover/prompt-session-row:invisible'

type SessionTab = Pick<TerminalTab, 'id' | 'worktreeId'>

/** A row with a tab of its own (not a helper, not a closed session kept for history). */
export function isPromptClosableSession(
  agent: Pick<DashboardAgentRow, 'rowSource' | 'tab'>
): boolean {
  return (agent.rowSource ?? 'live') === 'live' && Boolean(agent.tab?.id && agent.tab.worktreeId)
}

/** × over the time at the end of a session row's first line; shown only while hovered. */
export function PromptSessionCloseButton({
  tab,
  name
}: {
  tab: SessionTab
  name: string
}): React.JSX.Element {
  useUiLanguageRevision()
  const { id: tabId, worktreeId } = tab
  const label = translate('prompt.sidebarSessions.closeNamed', 'Close {{name}}', { name })
  return (
    <button
      type="button"
      className={cn(
        'absolute top-1 right-1 hidden size-4 items-center justify-center rounded-sm',
        'text-muted-foreground',
        'hover:bg-accent hover:text-foreground focus-visible:inline-flex',
        'group-hover/prompt-session-row:inline-flex'
      )}
      aria-label={label}
      title={label}
      data-prompt-session-close=""
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        closePromptSession(worktreeId, tabId)
      }}
    >
      <X className="size-3" strokeWidth={1.75} />
    </button>
  )
}

/**
 * Right-click menu of one sidebar session row (decision 2A): rename, tab color, close session.
 * Rename edits the name in place on the row ([PROMPT] 사이드바 1A).
 * A Claude row with a known session id also offers a copy in a new window ([PROMPT] 창 복사 1A).
 * A live Claude row keeps "Model ▸" on top, as the workspace menu offered it before. The scope
 * attribute tells the workspace menu around the row to leave this right-click alone.
 */
export function PromptSessionRowMenu({
  tab,
  name,
  paneKey = null,
  copyCommand = null,
  children
}: {
  tab: SessionTab
  /** The row's name, for the ×'s label. */
  name: string
  paneKey?: string | null
  /** Command that starts a copy of this Claude session; null hides the menu item. */
  copyCommand?: string | null
  children: React.ReactNode
}): React.JSX.Element {
  useUiLanguageRevision()
  const { id: tabId, worktreeId } = tab
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [point, setPoint] = useState({ x: 0, y: 0 })
  const color = useAppStore((s) =>
    open
      ? ((s.tabsByWorktree?.[worktreeId] ?? []).find((t) => t.id === tabId)?.color ?? null)
      : null
  )
  const closeShortcut = useOptionalShortcutLabel('tab.close')
  const renameShortcut = useOptionalShortcutLabel('tab.rename')

  useEffect(() => {
    if (!open) {
      return
    }
    const close = (): void => setOpen(false)
    window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, close)
    return () => window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, close)
  }, [open])

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
    // Why: the virtual list moves rows with `transform`, and a transformed ancestor becomes the
    // box `position: fixed` measures from, so viewport coordinates would land the menu one row
    // offset lower. Measure from this wrapper (it is `relative`) like the workspace menu does.
    const bounds = event.currentTarget.getBoundingClientRect()
    setPoint({ x: event.clientX - bounds.left, y: event.clientY - bounds.top })
    setOpen(true)
  }, [])

  return (
    <div
      className={cn('relative min-w-0', PROMPT_SESSION_ROW_GROUP_CLASS)}
      {...{ [WORKTREE_CONTEXT_MENU_SCOPE_ATTR]: 'prompt-session' }}
      data-prompt-session-menu={tabId}
      onContextMenu={handleContextMenu}
    >
      {children}
      {renaming ? (
        <PromptSessionRowRename
          tabId={tabId}
          worktreeId={worktreeId}
          rowName={name}
          onDone={() => setRenaming(false)}
        />
      ) : null}
      <PromptSessionCloseButton tab={tab} name={name} />
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            aria-hidden
            tabIndex={-1}
            className="pointer-events-none absolute size-px opacity-0"
            style={{ left: point.x, top: point.y }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="min-w-44"
          sideOffset={0}
          align="start"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          // Why: handing focus back to the hidden trigger would blur the rename box just opened.
          onCloseAutoFocus={(event) => {
            if (renaming) {
              event.preventDefault()
            }
          }}
        >
          {open ? <PromptClaudeModelSubmenu paneKey={paneKey} /> : null}
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil className="size-3.5" />
            {translate('prompt.sidebarSessions.rename', 'Rename…')}
            {renameShortcut ? <DropdownMenuShortcut>{renameShortcut}</DropdownMenuShortcut> : null}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Layers className="size-3.5" />
              {translate('prompt.sidebarSessions.tabColor', 'Tab Color')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {TAB_COLORS.map((option) => (
                <DropdownMenuItem
                  key={option.label}
                  onSelect={() => setPromptSessionColor(tabId, option.value)}
                  data-prompt-session-color={option.value ?? 'none'}
                  aria-checked={color === option.value}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'size-2.5 shrink-0 rounded-full border',
                      option.value ? 'border-transparent' : 'border-muted-foreground/50'
                    )}
                    style={option.value ? { backgroundColor: option.value } : undefined}
                  />
                  {option.label}
                  {color === option.value ? <DropdownMenuShortcut>✓</DropdownMenuShortcut> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          {copyCommand ? (
            <>
              <DropdownMenuItem
                onSelect={() => openPromptSessionCopyWindow(worktreeId, copyCommand)}
              >
                <Copy className="size-3.5" />
                {translate('prompt.sidebarSessions.copyToNewWindow', 'Copy to New Window')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => closePromptSession(worktreeId, tabId)}
          >
            <X className="size-3.5" />
            {translate('prompt.sidebarSessions.close', 'Close Session')}
            {closeShortcut ? <DropdownMenuShortcut>{closeShortcut}</DropdownMenuShortcut> : null}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/**
 * Gives a sidebar agent row the session menu and hover × when it is a Prompt session row with a
 * tab of its own; helper rows and closed sessions kept for history stay as they are.
 */
export function withPromptSessionRowMenu<
  P extends { agent: DashboardAgentRow; promptLayout?: boolean }
>(Row: React.ComponentType<P>): React.ComponentType<P> {
  return function PromptSessionMenuRow(props: P): React.JSX.Element {
    const { agent } = props
    if (!props.promptLayout || agent.childRow || !isPromptClosableSession(agent)) {
      return <Row {...props} />
    }
    const name = promptSessionTabName(agent.tab, agent.agentType) || promptNewSessionLabel()
    const session = agent.entry.providerSession
    const copyCommand =
      agent.agentType === 'claude' && session?.key === 'session_id'
        ? promptClaudeSessionCopyCommand(session.id)
        : null
    return (
      <PromptSessionRowMenu
        tab={agent.tab}
        name={name}
        paneKey={agent.paneKey}
        copyCommand={copyCommand}
      >
        <Row {...props} />
      </PromptSessionRowMenu>
    )
  }
}
