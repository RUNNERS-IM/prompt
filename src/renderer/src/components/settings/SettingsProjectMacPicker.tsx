import { useMemo } from 'react'
import { buildExecutionHostRegistry } from '../../../../shared/execution-host-registry'
import { getExecutionHostLabel } from '../../../../shared/execution-host'
import { getHostDisplayLabelOverrides } from '../../../../shared/host-setting-overrides'
import type { ProjectHostSetup } from '../../../../shared/project-types'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { thisComputerTag, usePromptLocalComputerName } from '../sidebar/prompt-local-computer-label'

type SettingsProjectMacPickerProps = {
  setups: readonly ProjectHostSetup[]
  selectedSetupId: string | undefined
  onChoose: (setup: ProjectHostSetup) => void
}

/** Picks which Mac's copy a joined same-folder project row shows (runners-wiki 2026-11-19 4A). */
export function SettingsProjectMacPicker({
  setups,
  selectedSetupId,
  onChoose
}: SettingsProjectMacPickerProps): React.JSX.Element | null {
  const repos = useAppStore((state) => state.repos)
  const settings = useAppStore((state) => state.settings)
  const sshTargetLabels = useAppStore((state) => state.sshTargetLabels)
  const runtimeEnvironments = useAppStore((state) => state.runtimeEnvironments)
  const localComputerName = usePromptLocalComputerName()
  const localHostLabel = `${localComputerName} ${thisComputerTag()}`
  const labelById = useMemo(
    () =>
      new Map(
        buildExecutionHostRegistry({
          repos,
          settings,
          hostSource: 'configured-only',
          sshTargetLabels,
          runtimeEnvironments,
          hostLabelOverrides: getHostDisplayLabelOverrides(settings),
          localHostLabel
        }).map((entry) => [entry.id, entry.label])
      ),
    [repos, settings, sshTargetLabels, runtimeEnvironments, localHostLabel]
  )
  const openable = setups.filter((setup) => setup.repoId.trim())
  if (openable.length < 2) {
    return null
  }
  const label = translate('prompt.settings.project.viewingMac', 'Mac to show settings for')
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="font-medium text-foreground">{label}</span>
      <Select
        value={selectedSetupId ?? openable[0].id}
        onValueChange={(setupId) => {
          const setup = openable.find((candidate) => candidate.id === setupId)
          if (setup) {
            onChoose(setup)
          }
        }}
      >
        <SelectTrigger size="sm" aria-label={label} className="min-w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {openable.map((setup) => {
            const hostId = setup.executionHostId ?? setup.hostId
            return (
              <SelectItem key={setup.id} value={setup.id}>
                {labelById.get(hostId) ?? getExecutionHostLabel(hostId)}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    </div>
  )
}
