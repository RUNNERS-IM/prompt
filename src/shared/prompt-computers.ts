/** Prompt computer picker: names shared by main, preload, renderer and the CLI. */

export const PROMPT_LOCAL_HOST_NAME_CHANNEL = 'prompt:localHostName'

/** Runtime RPC method behind `orca environment share`. Local Unix-socket callers only. */
export const PROMPT_ENVIRONMENT_SHARE_METHOD = 'prompt.environment.share'

export type PromptEnvironmentShareParams = { address: string }

export type PromptEnvironmentShareResult = {
  pairingUrl: string
  endpoint: string
  deviceId: string
}
