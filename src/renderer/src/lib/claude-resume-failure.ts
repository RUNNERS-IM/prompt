import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { INLINE_ACTION_CLASS_NAMES } from '@/components/ui/sonner'
import {
  inspectRuntimeTerminalProcess,
  type RuntimeTerminalProcessInspection
} from '@/runtime/runtime-terminal-inspection'
import { localizedTerminalTitle } from '@/lib/terminal-default-title-label'
import { useAppStore } from '@/store'
import { isExpectedAgentProcess } from '../../../shared/agent-process-recognition'
import { isShellProcess } from '../../../shared/shell-process-detection'
import { TUI_AGENT_CONFIG } from '../../../shared/tui-agent-config'
import type { AgentAccountRestartStartup } from './agent-account-restart-startup'

export type ClaudeResumeFailure = {
  tabId: string
  leafId: string
  ptyId: string
  startup: AgentAccountRestartStartup
  failedAt: number
}

const POLL_INTERVAL_MS = 1000
const RUNNING_POLLS_TO_CONFIRM = 5
// One empty read can span a process handoff.
const SHELL_POLLS_TO_CONFIRM = 2
const START_DEADLINE_MS = 45_000

let failures: readonly ClaudeResumeFailure[] = []
const listeners = new Set<() => void>()
const retryStartups = new Map<string, AgentAccountRestartStartup>()

function publish(next: readonly ClaudeResumeFailure[]): void {
  failures = next
  for (const listener of listeners) {
    listener()
  }
}

export function getClaudeResumeFailures(): readonly ClaudeResumeFailure[] {
  return failures
}

export function subscribeClaudeResumeFailures(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function clearFailure(ptyId: string): void {
  if (failures.some((failure) => failure.ptyId === ptyId)) {
    publish(failures.filter((failure) => failure.ptyId !== ptyId))
  }
}

function boundPtyId(pane: Pick<ClaudeResumeFailure, 'tabId' | 'leafId'>): string | undefined {
  return useAppStore.getState().terminalLayoutsByTabId[pane.tabId]?.ptyIdsByLeafId?.[pane.leafId]
}

type ResumeOutcome = 'running' | 'failed' | 'unknown'

/** Why the shell decides: a resume that can't find its conversation prints an error and returns to the prompt. */
async function readResumeOutcome(
  pane: Pick<ClaudeResumeFailure, 'tabId' | 'leafId' | 'ptyId'>
): Promise<ResumeOutcome> {
  const deadline = Date.now() + START_DEADLINE_MS
  let runningPolls = 0
  let shellPolls = 0
  let atShell = false
  while (Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS))
    const bound = boundPtyId(pane)
    if (bound !== undefined && bound !== pane.ptyId) {
      return 'unknown'
    }
    const inspection = await inspectRuntimeTerminalProcess(pane.ptyId).catch(() => null)
    atShell = inspection !== null && showsBareShell(inspection)
    if (
      inspection?.foregroundProcess &&
      isExpectedAgentProcess(inspection.foregroundProcess, TUI_AGENT_CONFIG.claude.expectedProcess)
    ) {
      runningPolls += 1
      shellPolls = 0
      if (runningPolls >= RUNNING_POLLS_TO_CONFIRM) {
        return 'running'
      }
      continue
    }
    shellPolls = atShell ? shellPolls + 1 : 0
    if (runningPolls > 0 && shellPolls >= SHELL_POLLS_TO_CONFIRM) {
      return 'failed'
    }
  }
  return atShell ? 'failed' : 'unknown'
}

/** Why evidence too: a host that verified its table reports a bare shell as no process at all. */
function showsBareShell(inspection: RuntimeTerminalProcessInspection): boolean {
  return inspection.foregroundProcess
    ? isShellProcess(inspection.foregroundProcess)
    : inspection.foregroundProcessEvidence?.verdict === 'live'
}

function tabTitle(tabId: string): string | undefined {
  for (const tabs of Object.values(useAppStore.getState().tabsByWorktree)) {
    const tab = tabs.find((candidate) => candidate.id === tabId)
    if (tab) {
      return tab.customTitle ?? localizedTerminalTitle(tab.title)
    }
  }
  return undefined
}

function toastId(ptyId: string): string {
  return `claude-resume-failed:${ptyId}`
}

function reportFailure(failure: ClaudeResumeFailure): void {
  publish([...failures.filter((other) => other.ptyId !== failure.ptyId), failure])
  toast.error(translate('prompt.sessionRow.resumeFailed', "Couldn't reopen this session"), {
    id: toastId(failure.ptyId),
    description: tabTitle(failure.tabId),
    classNames: INLINE_ACTION_CLASS_NAMES,
    action: {
      label: translate('prompt.sessionRow.retryResume', 'Try again'),
      onClick: () => retryClaudeResume(failure.ptyId)
    }
  })
}

/** Watches a just-launched Claude resume and reports it only when the terminal is back at its shell. */
export function watchClaudeResumeStart(
  pane: Pick<ClaudeResumeFailure, 'tabId' | 'leafId' | 'ptyId' | 'startup'>
): void {
  clearFailure(pane.ptyId)
  void readResumeOutcome(pane).then((outcome) => {
    if (outcome === 'failed' && boundPtyId(pane) === pane.ptyId) {
      reportFailure({ ...pane, failedAt: Date.now() })
    }
  })
}

export function retryClaudeResume(ptyId: string): void {
  const failure = failures.find((candidate) => candidate.ptyId === ptyId)
  if (!failure) {
    return
  }
  clearFailure(ptyId)
  toast.dismiss(toastId(ptyId))
  retryStartups.set(ptyId, failure.startup)
  useAppStore.getState().queuePaneAccountRestarts([ptyId], 'claude')
}

/** The failed launch to repeat; its status and sleeping record may already be gone. */
export function takeClaudeResumeRetryStartup(ptyId: string): AgentAccountRestartStartup | null {
  const startup = retryStartups.get(ptyId) ?? null
  retryStartups.delete(ptyId)
  return startup
}
