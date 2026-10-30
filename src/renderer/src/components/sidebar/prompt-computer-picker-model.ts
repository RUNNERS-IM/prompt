import {
  LOCAL_EXECUTION_HOST_ID,
  toRuntimeExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host'
import type { ExecutionHostHealth } from '../../../../shared/execution-host-health'
import {
  expandEquivalentExecutionHostIds,
  indexExecutionHostsById,
  pickerExecutionHosts
} from '../../../../shared/managed-orcad-execution-host'
import type { SidebarHostOption } from './sidebar-host-options'

/**
 * Prompt computer picker: the sidebar shows one computer at a time. It sits on top of Orca's
 * presentation-only host filter (visibleWorkspaceHostIds), always keeping exactly one row picked.
 */

export type PromptComputerStatus = 'connected' | 'connecting' | 'offline'

export type PromptComputerRow = {
  id: ExecutionHostId
  label: string
  isLocal: boolean
  status: PromptComputerStatus
}

export function promptComputerStatus(health: ExecutionHostHealth): PromptComputerStatus {
  switch (health) {
    case 'local':
    case 'available':
      return 'connected'
    case 'connecting':
      return 'connecting'
    default:
      return 'offline'
  }
}

/**
 * Whether a host is a Prompt computer: this Mac or a paired Prompt runtime (`orca environment
 * add`). A plain SSH host from ~/.ssh/config is not one; it stays usable in Settings → SSH Hosts
 * and the other host menus. An SSH row that stands for a managed runtime (relay route) counts.
 */
export function isPromptComputerHost(
  host: Pick<SidebarHostOption, 'kind' | 'aliasHostIds'>
): boolean {
  if (host.kind !== 'ssh') {
    return true
  }
  return host.aliasHostIds?.some((id) => id.startsWith('runtime:')) ?? false
}

/** One row per machine, this computer first, then the rest in the registry's order. */
export function buildPromptComputerRows(
  hostOptions: readonly SidebarHostOption[],
  localLabel: string
): PromptComputerRow[] {
  const rows = pickerExecutionHosts(hostOptions)
    .filter(isPromptComputerHost)
    .map((host): PromptComputerRow => ({
      id: host.id,
      label: host.id === LOCAL_EXECUTION_HOST_ID ? localLabel : host.label,
      isLocal: host.id === LOCAL_EXECUTION_HOST_ID,
      status: promptComputerStatus(host.health)
    }))
  if (!rows.some((row) => row.isLocal)) {
    rows.unshift({
      id: LOCAL_EXECUTION_HOST_ID,
      label: localLabel,
      isLocal: true,
      status: 'connected'
    })
  }
  return [...rows.filter((row) => row.isLocal), ...rows.filter((row) => !row.isLocal)]
}

/**
 * The picked row, or null when the saved filter is "all hosts" or spans several machines (then
 * the picker narrows it to one). A saved runtime host whose pairing was removed, or a saved plain
 * SSH host (no longer listed), falls back to null once the environment list has loaded; before
 * that, the saved choice is kept as is because an SSH row may still turn out to be a runtime.
 */
export function resolvePromptSelectedComputer(args: {
  visibleHostIds: readonly ExecutionHostId[] | null
  hostOptions: readonly SidebarHostOption[]
  runtimeCatalogHydrated: boolean
}): ExecutionHostId | null {
  if (!args.visibleHostIds || args.visibleHostIds.length === 0) {
    return null
  }
  const byId = indexExecutionHostsById(args.hostOptions)
  const rowIds = new Set(args.visibleHostIds.map((id) => byId.get(id)?.id ?? id))
  if (rowIds.size !== 1) {
    return null
  }
  const [selected] = rowIds as Set<ExecutionHostId>
  if (selected === undefined) {
    return null
  }
  if (!args.runtimeCatalogHydrated || selected === LOCAL_EXECUTION_HOST_ID) {
    return selected
  }
  const host = byId.get(selected)
  if (!host || !isPromptComputerHost(host)) {
    return null
  }
  return selected
}

/** What to store when a row is picked: the row and every id that stands for the same machine. */
export function promptComputerVisibleHostIds(
  hostOptions: readonly SidebarHostOption[],
  id: ExecutionHostId
): ExecutionHostId[] {
  return expandEquivalentExecutionHostIds(hostOptions, [id])
}

/** The narrowed choice when the saved filter is not a single computer. */
export function fallbackPromptComputer(
  visibleHostIds: readonly ExecutionHostId[] | null,
  rows: readonly PromptComputerRow[]
): ExecutionHostId {
  const firstKnown = visibleHostIds?.find((id) => rows.some((row) => row.id === id))
  return firstKnown ?? LOCAL_EXECUTION_HOST_ID
}

/** A paired environment that showed up while the add dialog was open; the picker switches to it. */
export function newlyAddedRuntimeHostId(
  before: ReadonlySet<string>,
  after: readonly { id: string }[]
): ExecutionHostId | null {
  const added = after.find((environment) => !before.has(environment.id))
  return added ? toRuntimeExecutionHostId(added.id) : null
}
