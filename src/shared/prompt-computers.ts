/** Prompt computer picker: names shared by main, preload, renderer and the CLI. */

export const PROMPT_LOCAL_HOST_NAME_CHANNEL = 'prompt:localHostName'
export const PROMPT_TAILNET_COMPUTERS_CHANNEL = 'prompt:tailnetComputers'
export const PROMPT_TAILNET_CONNECT_CHANNEL = 'prompt:tailnetConnect'

/** A computer of this tailnet that is not in the picker yet. */
export type PromptTailnetComputer = { id: string; name: string; online: boolean }

export type PromptTailnetConnectResult =
  | { ok: true; name: string }
  | { ok: false; reason: 'not_found' | 'offline' | 'no_prompt' | 'unavailable' }

/** Runtime RPC method behind `orca environment share`. Local Unix-socket callers only. */
export const PROMPT_ENVIRONMENT_SHARE_METHOD = 'prompt.environment.share'

export type PromptEnvironmentShareParams = { address: string }

export type PromptEnvironmentShareResult = {
  pairingUrl: string
  endpoint: string
  deviceId: string
}
