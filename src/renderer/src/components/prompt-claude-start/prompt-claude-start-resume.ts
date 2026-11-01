import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { resolveAiVaultPanelSessionListRequest } from '../right-sidebar/ai-vault-panel-session-list-request'
import {
  readCachedAiVaultSessionList,
  refreshAiVaultSessionList
} from '../right-sidebar/ai-vault-session-list-request'

export const PROMPT_CLAUDE_RESUME_LIMIT = 3

function samePath(a: string, b: string): boolean {
  const trim = (value: string) => value.replace(/[\\/]+$/, '')
  return trim(a) === trim(b)
}

/**
 * The newest Claude conversations started in this folder, as the session history panel lists
 * them. Subagent transcripts and chat-owned conversations are left out: neither resumes with a
 * plain `claude --resume` in a terminal.
 */
export function pickPromptClaudeResumeSessions(
  sessions: readonly AiVaultSession[],
  folderPath: string,
  limit = PROMPT_CLAUDE_RESUME_LIMIT
): AiVaultSession[] {
  return sessions
    .filter(
      (session) =>
        session.agent === 'claude' &&
        !session.subagent &&
        !session.structuredSession &&
        [session.cwd, ...(session.cwdAliases ?? [])].some(
          (cwd) => typeof cwd === 'string' && samePath(cwd, folderPath)
        )
    )
    .sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt))
    .slice(0, limit)
}

/** Recent conversations for the box: the panel's cached list at once, then a fresh scan. */
export function usePromptClaudeResumeSessions(
  worktreeId: string,
  folderPath: string,
  enabled: boolean
): AiVaultSession[] {
  const [sessions, setSessions] = useState<AiVaultSession[]>([])
  useEffect(() => {
    if (!enabled || !folderPath) {
      return
    }
    let cancelled = false
    const request = resolveAiVaultPanelSessionListRequest(useAppStore.getState(), worktreeId)
    const cached = readCachedAiVaultSessionList(request)
    if (cached) {
      setSessions(pickPromptClaudeResumeSessions(cached.sessions, folderPath))
    }
    refreshAiVaultSessionList(request, { requestToken: createBrowserUuid() })
      .then((result) => {
        if (!cancelled && !result.cancelled) {
          setSessions(pickPromptClaudeResumeSessions(result.sessions, folderPath))
        }
      })
      .catch(() => {
        // No history is the same as an empty list here; the panel reports scan problems.
      })
    return () => {
      cancelled = true
    }
  }, [enabled, folderPath, worktreeId])
  return sessions
}
