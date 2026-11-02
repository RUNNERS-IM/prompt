import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { deriveRunningAgentSendTargets } from '@/lib/running-agent-targets'
import { translate } from '@/i18n/i18n'
import { agentSendDisabledReasonLabel } from '@/lib/agent-send-disabled-reason-label'
import {
  selectSendTargetControlInputs,
  selectSendTargetInputs
} from './worktree-card-send-target-inputs'

type WorktreeCardSendTarget = {
  status: 'eligible' | 'disabled' | 'sending'
  disabledReason?: string
}

/** While the send popover picks a target, each agent row's pick status in this worktree. */
export function useWorktreeCardSendTargets(worktreeId: string, languageRevision: number) {
  const { targetMode: agentSendPopoverTargetMode, agentStatusEpoch } = useAppStore(
    useShallow((s) => selectSendTargetControlInputs(s, worktreeId))
  )
  const sendTargetInputs = useAppStore(useShallow((s) => selectSendTargetInputs(s, worktreeId)))
  const sendPromptToSidebarAgentTarget = useAppStore((s) => s.sendPromptToSidebarAgentTarget)

  const isAgentSendTargetModeActive = agentSendPopoverTargetMode !== null
  const sendTargetsByPaneKey = useMemo(() => {
    void agentStatusEpoch
    void languageRevision
    if (!isAgentSendTargetModeActive) {
      return new Map<string, WorktreeCardSendTarget>()
    }

    return new Map(
      deriveRunningAgentSendTargets(sendTargetInputs, worktreeId).map((target) => [
        target.paneKey,
        agentSendPopoverTargetMode?.status === 'sending' &&
        agentSendPopoverTargetMode.sendingPaneKey === target.paneKey
          ? {
              status: 'sending' as const,
              disabledReason: translate(
                'auto.components.sidebar.WorktreeCardAgents.sendingTarget',
                'Sending...'
              )
            }
          : target.disabledReason
            ? {
                status: target.status,
                disabledReason: agentSendDisabledReasonLabel(target.disabledReason)
              }
            : { status: target.status }
      ])
    )
  }, [
    // Freshness timers advance this epoch without replacing the status map.
    agentStatusEpoch,
    languageRevision,
    agentSendPopoverTargetMode?.sendingPaneKey,
    agentSendPopoverTargetMode?.status,
    isAgentSendTargetModeActive,
    sendTargetInputs,
    worktreeId
  ])

  const handleSendTargetClick = useCallback(
    (paneKey: string) => {
      void sendPromptToSidebarAgentTarget(paneKey)
    },
    [sendPromptToSidebarAgentTarget]
  )

  const sendTargetFor = (paneKey: string) =>
    isAgentSendTargetModeActive
      ? (sendTargetsByPaneKey.get(paneKey) ?? {
          status: 'disabled' as const,
          disabledReason: translate(
            'auto.components.sidebar.WorktreeCardAgents.agentUnavailable',
            'Agent is not available'
          )
        })
      : undefined

  return { isAgentSendTargetModeActive, sendTargetFor, handleSendTargetClick }
}
