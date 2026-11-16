import { useEffect } from 'react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import type { PromptLibraryItem } from '../../../shared/prompt-library-types'
import { pickAutoPrompts, recordPromptUse } from '@/components/right-sidebar/prompt-library-auto'
import {
  getSharedPrompts,
  isSharedPromptsLoaded,
  subscribeSharedPrompts
} from './prompt-shared-library-store'

// 「프롬프트」 칸 뒤에서 도는 두 가지: 처음 켤 때 기본 프롬프트 넣기, 친 글을 세어 자주 친 글 넣기.

const DEFAULT_PROMPT_IDS = [
  'plan',
  'options',
  'rootCause',
  'review',
  'overview',
  'tests',
  'buildTest',
  'commit',
  'status',
  'handoff'
] as const

export function buildDefaultPrompts(now: number): PromptLibraryItem[] {
  return DEFAULT_PROMPT_IDS.map((id) => ({
    id: `default-${id}`,
    title: translate(`prompt.library.defaults.${id}.title`, id),
    body: translate(`prompt.library.defaults.${id}.body`, id),
    updatedAt: now
  }))
}

/** 사람이 친 글만 센다. 하위 에이전트 · 지휘 세션이 보낸 글, 다시 켤 때 되살린 줄은 뺀다. */
function countablePrompt(entry: AgentStatusEntry): string | null {
  if (entry.subagentObservation || entry.orchestration || entry.restoredUnconfirmed) {
    return null
  }
  const prompt = entry.prompt.trim()
  return prompt ? prompt : null
}

function promptMarker(entry: AgentStatusEntry): string {
  return `${entry.turnStartedAt ?? ''}|${entry.prompt}`
}

export function startPromptLibraryBackground(): () => void {
  const lastMarkerByPane = new Map<string, string>()
  let seedSent = false

  const seedDefaults = (): void => {
    const settings = useAppStore.getState().settings
    if (seedSent || !settings || settings.promptLibrarySeeded || !isSharedPromptsLoaded()) {
      return
    }
    seedSent = true
    const updates: Partial<GlobalSettings> = { promptLibrarySeeded: true }
    // 공용 목록이 있는 맥이나 이미 저장한 글이 있으면 기본 글을 넣지 않는다.
    if (settings.promptLibrary.length === 0 && getSharedPrompts().length === 0) {
      updates.promptLibrary = buildDefaultPrompts(Date.now())
    }
    void useAppStore.getState().updateSettings(updates)
  }

  const countPrompts = (rows: Readonly<Record<string, AgentStatusEntry>>): void => {
    const changed: { paneKey: string; prompt: string; turnKey: string }[] = []
    for (const entry of Object.values(rows)) {
      const marker = promptMarker(entry)
      if (lastMarkerByPane.get(entry.paneKey) === marker) {
        continue
      }
      lastMarkerByPane.set(entry.paneKey, marker)
      const prompt = countablePrompt(entry)
      if (prompt) {
        changed.push({
          paneKey: entry.paneKey,
          prompt,
          turnKey: `${entry.paneKey}|${entry.turnStartedAt ?? entry.stateStartedAt}`
        })
      }
    }
    const settings = useAppStore.getState().settings
    if (changed.length === 0 || !settings) {
      return
    }
    const now = Date.now()
    let usage = settings.promptLibraryUsage ?? {}
    let usageChanged = false
    for (const { prompt, turnKey } of changed) {
      const next = recordPromptUse(usage, prompt, turnKey, now)
      if (next) {
        usage = next
        usageChanged = true
      }
    }
    if (!usageChanged) {
      return
    }
    const added = pickAutoPrompts({
      usage,
      library: settings.promptLibrary,
      shared: getSharedPrompts(),
      dismissed: settings.promptLibraryDismissedAuto ?? [],
      now
    })
    void useAppStore.getState().updateSettings({
      promptLibraryUsage: usage,
      ...(added.length > 0 ? { promptLibrary: [...settings.promptLibrary, ...added] } : {})
    })
  }

  // 켜는 순간 이미 있던 줄은 지난 차례라 세지 않는다.
  for (const entry of Object.values(useAppStore.getState().agentStatusByPaneKey)) {
    lastMarkerByPane.set(entry.paneKey, promptMarker(entry))
  }
  seedDefaults()
  const stopShared = subscribeSharedPrompts(seedDefaults)
  const stopStore = useAppStore.subscribe((state, previous) => {
    if (state.settings !== previous.settings) {
      seedDefaults()
    }
    if (state.agentStatusByPaneKey !== previous.agentStatusByPaneKey) {
      countPrompts(state.agentStatusByPaneKey)
    }
  })
  return () => {
    stopShared()
    stopStore()
  }
}

export function PromptLibraryGate(): null {
  useEffect(() => startPromptLibraryBackground(), [])
  return null
}
