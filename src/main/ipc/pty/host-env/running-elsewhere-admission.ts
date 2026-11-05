import { basename } from 'node:path'
import {
  claudeArgvSessionId,
  findClaudeSessionHolderElsewhere,
  noteClaudeResumeStarting
} from '../../../claude/live-claude-sessions'
import type { ResumeSpawnArgs, ResumeSpawnRefusal } from './saved-resume-admission'

/** The Claude conversation this start would resume: the launch's own facts, else its command line. */
export function claudeResumeTarget(args: ResumeSpawnArgs): string | null {
  if (args.launchAgent === 'claude' && args.resumeProviderSession?.id?.trim()) {
    // A fork resumes from the conversation but writes a new one.
    return /(^|\s)--fork-session(\s|=|$)/.test(args.command ?? '')
      ? null
      : args.resumeProviderSession.id.trim()
  }
  if (args.launchAgent && args.launchAgent !== 'claude') {
    return null
  }
  const words = (args.command ?? '').split(/\s+/).map((word) => word.replace(/^['"]|['"]$/g, ''))
  const program = words.findIndex((word) => basename(word) === 'claude')
  return program === -1 ? null : claudeArgvSessionId(words.slice(program))
}

/** Refuses a start that would resume a Claude conversation another live process writes. Every
 *  start reaches here — restores, chat-list resumes, account restarts and CLI-created terminals. */
export async function admitClaudeResumeElsewhere(
  args: ResumeSpawnArgs,
  paneKey: string | null,
  wslDistro: string | null
): Promise<ResumeSpawnRefusal | null> {
  // The process table read here is this host's; SSH and WSL conversations live elsewhere.
  if (args.connectionId || wslDistro !== null) {
    return null
  }
  const sessionId = claudeResumeTarget(args)
  if (!sessionId) {
    return null
  }
  // An unreadable process table proves nothing; starting is the old behavior.
  const holder = await findClaudeSessionHolderElsewhere(sessionId, paneKey).catch(() => null)
  if (!holder) {
    noteClaudeResumeStarting(sessionId, paneKey)
    return null
  }
  return {
    verdict: 'running-elsewhere',
    refused: {
      agent: 'claude',
      providerSession: args.resumeProviderSession ?? { key: 'session_id', id: sessionId }
    },
    holder
  }
}
