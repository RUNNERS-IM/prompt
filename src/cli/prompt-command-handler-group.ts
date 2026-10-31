import type { HandlerGroup } from './handler-group-manifest'

// Commands that exist only in the `prompt` tree; moved commands keep their legacy keys.
export const PROMPT_COMMAND_HANDLER_GROUP: HandlerGroup = {
  name: 'prompt',
  keys: [
    'prompt app version',
    'prompt project list',
    'prompt project add',
    'prompt project show',
    'prompt project set',
    'prompt project remove',
    'prompt project clone',
    'prompt project create',
    'prompt workspace list',
    'prompt terminal list',
    'prompt session list',
    'prompt session resume',
    'prompt session move',
    'prompt session close',
    'prompt session rename',
    'prompt session read',
    'prompt session send',
    'prompt session wait'
  ],
  load: async () => ({
    ...(await import('./handlers/prompt-project.js')).PROMPT_PROJECT_HANDLERS,
    ...(await import('./handlers/prompt-lists.js')).PROMPT_LIST_HANDLERS,
    ...(await import('./handlers/prompt-session.js')).PROMPT_SESSION_HANDLERS
  })
}
