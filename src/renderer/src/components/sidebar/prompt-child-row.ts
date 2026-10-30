import type { AgentChildRowModel } from '../../../../shared/agent-child-row-model'

/**
 * Prompt sidebar helper rows drop the role tail ("- general-purpose"): it only names the kind of
 * helper, which means nothing to the person. Any other detail (what it is doing, that it ended)
 * stays.
 */
export function promptChildRowWithoutRoleTail(row: AgentChildRowModel): AgentChildRowModel {
  return row.detail?.kind === 'role' ? { ...row, detail: null } : row
}
