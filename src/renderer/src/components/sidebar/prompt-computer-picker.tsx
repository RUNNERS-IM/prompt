import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Laptop, Plus, Share2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { usePublishedMachineName } from '../settings/use-published-machine-name'
import { AddRemoteHostDialog, type AddRemoteHostMode } from './AddRemoteHostDialog'
import { PromptShareComputerDialog } from './prompt-share-computer-dialog'
import { useSidebarHostScopeOptions } from './use-sidebar-host-scope-options'
import {
  buildPromptComputerRows,
  fallbackPromptComputer,
  newlyAddedRuntimeHostId,
  promptComputerVisibleHostIds,
  resolvePromptSelectedComputer,
  type PromptComputerRow,
  type PromptComputerStatus
} from './prompt-computer-picker-model'

const STATUS_DOT_CLASS: Record<PromptComputerStatus, string> = {
  connected: 'bg-(--status-success)',
  connecting: 'bg-(--status-warning)',
  offline: 'bg-worktree-sidebar-foreground/25'
}

function StatusDot({ status }: { status: PromptComputerStatus }): React.JSX.Element {
  return (
    <span
      aria-hidden
      className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT_CLASS[status])}
      data-prompt-computer-status={status}
    />
  )
}

function statusLabel(status: PromptComputerStatus): string {
  switch (status) {
    case 'connected':
      return translate('prompt.computerPicker.connected', 'Connected')
    case 'connecting':
      return translate('prompt.computerPicker.connecting', 'Connecting')
    case 'offline':
      return translate('prompt.computerPicker.offline', 'Offline')
  }
}

function rowLabel(row: PromptComputerRow): string {
  return row.isLocal
    ? `${row.label} ${translate('prompt.computerPicker.thisMac', '(this Mac)')}`
    : row.label
}

/**
 * Prompt: one select box at the very top of the sidebar ("m2-pro-1 (this Mac) ▾"). Picking a
 * computer switches the whole sidebar to that computer's projects and sessions; one at a time.
 */
export function PromptComputerPicker(): React.JSX.Element {
  useTranslation()
  const { hostOptions } = useSidebarHostScopeOptions()
  const visibleHostIds = useAppStore((s) => s.visibleWorkspaceHostIds)
  const setVisibleWorkspaceHostIds = useAppStore((s) => s.setVisibleWorkspaceHostIds)
  const runtimeCatalogHydrated = useAppStore((s) => s.runtimeEnvironmentCatalogHydrated)
  const runtimeEnvironments = useAppStore((s) => s.runtimeEnvironments)
  const machineName = useAppStore((s) => s.settings?.machineName ?? '')
  const publishedMachineName = usePublishedMachineName(machineName)
  const [addMode, setAddMode] = useState<AddRemoteHostMode | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const environmentIdsBeforeAdd = useRef<ReadonlySet<string> | null>(null)

  const localLabel =
    publishedMachineName ?? translate('prompt.computerPicker.thisComputer', 'This computer')
  const rows = useMemo(
    () => buildPromptComputerRows(hostOptions, localLabel),
    [hostOptions, localLabel]
  )
  const selectedId = resolvePromptSelectedComputer({
    visibleHostIds,
    hostOptions,
    runtimeCatalogHydrated
  })

  const select = useCallback(
    (id: ExecutionHostId) => {
      setVisibleWorkspaceHostIds(promptComputerVisibleHostIds(hostOptions, id))
    },
    [hostOptions, setVisibleWorkspaceHostIds]
  )

  // "All hosts" or several hosts: narrow to one so the sidebar shows a single computer.
  useEffect(() => {
    if (selectedId === null) {
      select(fallbackPromptComputer(visibleHostIds, rows))
    }
  }, [rows, select, selectedId, visibleHostIds])

  // A computer paired from "Add computer…" becomes the one shown.
  useEffect(() => {
    const before = environmentIdsBeforeAdd.current
    if (!before) {
      return
    }
    const added = newlyAddedRuntimeHostId(before, runtimeEnvironments)
    if (added) {
      environmentIdsBeforeAdd.current = null
      select(added)
    }
  }, [runtimeEnvironments, select])

  const openAddComputer = (): void => {
    environmentIdsBeforeAdd.current = new Set(runtimeEnvironments.map((env) => env.id))
    setAddMode('server')
  }

  const selectedRow = rows.find((row) => row.id === selectedId)
  // Before the paired-computer list loads, a saved remote choice has no row yet.
  const triggerLabel = selectedRow ? rowLabel(selectedRow) : '…'

  return (
    <div className="px-2 pt-2" data-prompt-computer-picker="">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="group flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-semibold tracking-tight text-worktree-sidebar-foreground/85 transition-colors hover:bg-worktree-sidebar-foreground/8 data-[state=open]:bg-worktree-sidebar-foreground/8"
            aria-label={translate('prompt.computerPicker.label', 'Computer')}
            data-prompt-computer-trigger=""
          >
            <Laptop
              className="size-4 shrink-0 text-worktree-sidebar-foreground/45"
              strokeWidth={1.5}
            />
            <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
            {selectedRow && selectedRow.status !== 'connected' ? (
              <StatusDot status={selectedRow.status} />
            ) : null}
            <ChevronDown
              className="size-3.5 shrink-0 text-worktree-sidebar-foreground/40"
              strokeWidth={1.5}
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={4}
          className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
          data-prompt-computer-menu=""
        >
          <div className="max-h-80 overflow-y-auto scrollbar-sleek">
            {rows.map((row) => {
              const selected = row.id === selectedId
              return (
                <DropdownMenuItem
                  key={row.id}
                  onSelect={() => select(row.id)}
                  className={cn(selected && 'bg-black/6 dark:bg-white/10')}
                  data-prompt-computer-row={row.id}
                  data-selected={selected ? 'true' : undefined}
                  title={`${rowLabel(row)} · ${statusLabel(row.status)}`}
                >
                  <StatusDot status={row.status} />
                  <span className="min-w-0 flex-1 truncate">{rowLabel(row)}</span>
                  {selected ? (
                    <Check className="size-3.5 text-foreground" strokeWidth={1.5} />
                  ) : (
                    <span aria-hidden className="size-3.5" />
                  )}
                </DropdownMenuItem>
              )
            })}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={openAddComputer} data-prompt-computer-action="add">
            <Plus strokeWidth={1.5} />
            {translate('prompt.computerPicker.add', 'Add computer…')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setShareOpen(true)} data-prompt-computer-action="share">
            <Share2 strokeWidth={1.5} />
            {translate('prompt.computerPicker.share', 'Share this computer…')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AddRemoteHostDialog
        mode={addMode}
        onOpenChange={(mode) => {
          setAddMode(mode)
          if (mode === null) {
            // Keep watching briefly: the store may publish the new environment after close.
            window.setTimeout(() => {
              environmentIdsBeforeAdd.current = null
            }, 5_000)
          }
        }}
      />
      <PromptShareComputerDialog open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  )
}
