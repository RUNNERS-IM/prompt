import type { HandlerGroup } from './handler-group-manifest'

// Prompt-only CLI commands; kept out of the upstream environment group to ease upstream merges.
export const PROMPT_ENVIRONMENT_HANDLER_GROUP: HandlerGroup = {
  name: 'prompt-environment',
  keys: ['environment share'],
  load: async () =>
    (await import('./handlers/prompt-environment-share.js')).PROMPT_ENVIRONMENT_SHARE_HANDLERS
}
