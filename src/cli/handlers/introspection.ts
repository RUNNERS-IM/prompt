import type { CommandHandler } from '../dispatch'
import { COMMAND_SPECS } from '../specs'
import { buildAgentContext, formatAgentContextSummary } from '../agent-context'
import { isPromptSurface } from '../command-tree/cli-surface'
import { PROMPT_COMMAND_SPECS } from '../command-tree/prompt-command-specs'

export const INTROSPECTION_HANDLERS: Record<string, CommandHandler> = {
  // Keep schema output runtime-free so it works offline and over SSH.
  'agent-context': async ({ json }) => {
    // Describe the tree the caller typed into, so agents copy commands that exist there.
    const schema = buildAgentContext(isPromptSurface() ? PROMPT_COMMAND_SPECS : COMMAND_SPECS)
    if (json) {
      console.log(JSON.stringify(schema, null, 2))
      return
    }
    console.log(formatAgentContextSummary(schema))
  }
}
