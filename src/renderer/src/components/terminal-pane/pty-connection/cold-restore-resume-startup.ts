import {
  getConnectionIdForWorktreeCopy,
  getConnectionIdFromState
} from '@/lib/connection-owner-resolution'
import { normalizeExecutionHostId } from '../../../../../shared/execution-host'
import { parseWorkspaceKey } from '../../../../../shared/workspace-scope'
import { useAppStore } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { buildAgentResumeStartupPlan } from '@/lib/tui-agent-startup'
import {
  resolveRuntimeHostReportedPlatform,
  resolveRuntimeHostTerminalWindowsShell,
  resolveSshHostReportedPlatform,
  resolveAgentResumeLaunchTarget
} from '@/lib/agent-resume-launch-target'
import {
  agentResumeOriginNamesAnotherExecutionHost,
  sleepingRecordNamesAnotherExecutionHost
} from '@/lib/sleeping-record-execution-host-scope'
import { resolveResumeLaunchRecipe } from '../../../../../shared/tui-agent-launch-defaults'
import {
  agentProviderSessionsEqual,
  isResumableTuiAgent,
  normalizeAgentProviderSession
} from '../../../../../shared/agent-session-resume'

import type { HeldPaneReopenOutcome } from '../newer-daemon-hold-state'
import type { ColdRestoreAgentResumeStartup } from './fresh-spawn-types'

import type { ConnectPanePtySession } from './connect-pane-pty-session'
import { resumeRecordedCwdNotice } from '@/lib/resume-recorded-cwd-notice'

export const NOT_REOPENED: HeldPaneReopenOutcome = {
  reopened: false,
  agentResumed: false
}

type AppState = ReturnType<typeof useAppStore.getState>

/**
 * The agent session a cold restore of this pane would resume; read-only, so pre-spawn checks can share it.
 * includeDone 은 입력을 기다리던('done') 대화 줄도 쓴다. 복원 때는 쓰지 않고, 맨 셸로 뜬 탭을 나중에 한 번 다시 열 때만 쓴다.
 */
export function findColdRestoreResumeSource(
  session: ConnectPanePtySession,
  state: AppState,
  includeDone = false
) {
  const entry = state.agentStatusByPaneKey[session.cacheKey]
  const sleepingRecordEntry = session.getSleepingRecordForPane(state)
  const sleepingRecord = sleepingRecordEntry?.record
  const liveEntry = entry && (includeDone || entry.state !== 'done') ? entry : null
  const agent = liveEntry ? liveEntry.agentType : sleepingRecord?.agent
  if (!agent || !isResumableTuiAgent(agent)) {
    return null
  }
  const providerSession = normalizeAgentProviderSession(
    liveEntry ? liveEntry.providerSession : sleepingRecord?.providerSession
  )
  return providerSession ? { agent, providerSession, liveEntry, sleepingRecordEntry } : null
}

export function bindBuildColdRestoreAgentResumeStartup(session: ConnectPanePtySession): void {
  session.buildColdRestoreAgentResumeStartup = (
    options: { includeDone?: boolean } = {}
  ): ColdRestoreAgentResumeStartup | null => {
    if (session.pendingStartupCommand) {
      return null
    }
    const state = useAppStore.getState()
    const source = findColdRestoreResumeSource(session, state, options.includeDone === true)
    if (!source) {
      return null
    }
    const { agent, providerSession, sleepingRecordEntry } = source
    const entry = source.liveEntry
    const sleepingRecord = sleepingRecordEntry?.record
    const useLiveEntry = entry !== null
    // Resume IDs name host-local transcripts: reject cross-host records, using catalog ownership while the pane transport is unresolved; retain the record for manual recovery.
    if (
      agentResumeOriginNamesAnotherExecutionHost(
        useLiveEntry ? entry.connectionId : sleepingRecord?.connectionId,
        session.executionHostId
      ) ||
      (sleepingRecord && sleepingRecordNamesAnotherExecutionHost(sleepingRecord, state))
    ) {
      return null
    }
    const matchingSleepingLaunchConfig =
      sleepingRecord?.launchConfig &&
      (!useLiveEntry ||
        (sleepingRecord.agent === agent &&
          agentProviderSessionsEqual(agent, sleepingRecord.providerSession, providerSession)))
        ? sleepingRecord.launchConfig
        : undefined
    const launchConfig =
      (useLiveEntry && entry ? state.getAgentLaunchConfigForStatusEntry(entry) : undefined) ??
      matchingSleepingLaunchConfig
    // Quote resume for the live pane’s effective Windows shell rather than the platform’s PowerShell default.
    // Why: a nested-SSH pane on a server runs on its SSH target; the pane's host names a worktree
    // copy, while a folder's own record carries its connection.
    const paneHostId = normalizeExecutionHostId(session.executionHostId)
    const connectionId =
      (paneHostId && parseWorkspaceKey(session.deps.worktreeId)?.type !== 'folder'
        ? getConnectionIdForWorktreeCopy(state, session.deps.worktreeId, paneHostId)
        : getConnectionIdFromState(state, session.deps.worktreeId)) ?? null
    const resumeTarget = resolveAgentResumeLaunchTarget({
      projectRuntime: session.projectRuntime,
      connectionId,
      executionHostId: session.executionHostId,
      worktreePath: session.worktree?.path,
      terminalWindowsShell: state.settings?.terminalWindowsShell,
      tabShellOverride: session.shellOverride,
      // Why the transport's runtime: the pane's own connection names the SSH target's owner.
      remotePlatform: resolveSshHostReportedPlatform(
        state,
        session.executionHostId,
        session.transport.getRuntimeEnvironmentId?.() ?? null,
        connectionId
      ),
      runtimeHostPlatform: resolveRuntimeHostReportedPlatform(state, session.executionHostId),
      runtimeHostTerminalWindowsShell: resolveRuntimeHostTerminalWindowsShell(
        state,
        session.executionHostId
      )
    })
    const startupPlan = buildAgentResumeStartupPlan({
      agent,
      providerSession,
      cmdOverrides: state.settings?.agentCmdOverrides ?? {},
      ...resolveResumeLaunchRecipe(launchConfig),
      platform: resumeTarget.platform,
      agentHostPlatform: resumeTarget.agentHostPlatform,
      shell: resumeTarget.shell,
      launchCwd: session.worktree?.path,
      recordedCwdNotice: resumeRecordedCwdNotice
    })
    if (!startupPlan) {
      return null
    }
    const coldRestoreLaunchToken = createBrowserUuid()
    return {
      agent,
      command: startupPlan.launchCommand,
      env: {
        ...startupPlan.env,
        ORCA_AGENT_LAUNCH_TOKEN: coldRestoreLaunchToken
      },
      launchConfig: startupPlan.launchConfig,
      resumeProviderSession: providerSession,
      resumeOrigin: 'saved',
      resumeSource: {
        cancelled: false,
        ...(sleepingRecord &&
        sleepingRecord.agent === agent &&
        agentProviderSessionsEqual(agent, sleepingRecord.providerSession, providerSession)
          ? { record: sleepingRecord }
          : {}),
        ...(useLiveEntry && entry
          ? {
              expectedStatus: {
                paneKey: session.cacheKey,
                receivedAt: entry.updatedAt,
                stateStartedAt: entry.stateStartedAt
              }
            }
          : {})
      },
      launchToken: coldRestoreLaunchToken,
      useLiveEntry: Boolean(useLiveEntry),
      hasSleepingRecord: Boolean(sleepingRecord),
      sleepingRecordEntry
    }
  }
}

/**
 * 복원 명령 없이 맨 셸로 뜨는 탭 가운데, 입력을 기다리던('done') Claude 대화 줄 때문에만 빠진 탭이면
 * 나중에 한 번 다시 열 명령을 돌려준다. 거절 · 다른 컴퓨터 기록처럼 일부러 빠진 탭은 null 이다.
 */
export function buildBareShellClaudeResume(
  session: ConnectPanePtySession
): ColdRestoreAgentResumeStartup | null {
  const state = useAppStore.getState()
  if (
    findColdRestoreResumeSource(session, state) !== null ||
    findColdRestoreResumeSource(session, state, true) === null
  ) {
    return null
  }
  const startup = session.buildColdRestoreAgentResumeStartup({
    includeDone: true
  })
  return startup?.agent === 'claude' && startup.resumeProviderSession ? startup : null
}

/** Keeps the reattach fallback's actual fresh-agent outcome with the pane's start. */
export function reopenPaneAfterMissingReattach(
  session: ConnectPanePtySession,
  startup: ColdRestoreAgentResumeStartup | null,
  resumedAgent: (ptyId: string) => boolean
): Promise<HeldPaneReopenOutcome> {
  let resumeUnavailable = false
  return session
    .startFreshColdRestoreAgentResume(startup, {
      forceBlankRestoredViewport: true,
      onAgentResumeUnavailable: () => {
        resumeUnavailable = true
      }
    })
    .then(
      (ptyId: string | null) => ({
        reopened: ptyId !== null,
        agentResumed: ptyId !== null && resumedAgent(ptyId) && !resumeUnavailable
      }),
      () => NOT_REOPENED
    )
}
