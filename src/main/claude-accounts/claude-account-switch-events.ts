import type { PromptClaudeAccountSwitchedEvent } from '../../shared/prompt-claude-login-sync'

type Listener = (event: PromptClaudeAccountSwitchedEvent) => void

const listeners = new Set<Listener>()

/** Why plain Node: the RPC layer also runs headless, where no window listens. */
export function onClaudeAccountSwitchedByCommand(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitClaudeAccountSwitchedByCommand(event: PromptClaudeAccountSwitchedEvent): void {
  for (const listener of listeners) {
    listener(event)
  }
}
