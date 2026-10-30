import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { rejectRemoteSelectionFlags } from '../remote-selection-flag-rejection'
import { RuntimeClientError } from '../runtime-client'
import {
  PROMPT_ENVIRONMENT_SHARE_METHOD,
  type PromptEnvironmentShareResult
} from '../../shared/prompt-computers'

/**
 * Prompt: `orca environment share --address <host>` asks the Prompt app running on this computer
 * for a runtime pairing link advertised at <host>, so pairing can be scripted over SSH:
 *   ssh other-mac orca environment share --address other-mac
 *   orca environment add --name other-mac --pairing-code <printed link>
 */
export const PROMPT_ENVIRONMENT_SHARE_HANDLERS: Record<string, CommandHandler> = {
  'environment share': async ({ client, flags, json }) => {
    rejectRemoteSelectionFlags(
      flags,
      '`orca environment share`. Only the app running on this computer can share it; run the command on the computer you want to share (over SSH if needed).'
    )
    const address = flags.get('address')
    if (typeof address !== 'string' || address.trim().length === 0) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Missing required --address (the name other computers use to reach this one, e.g. m2-pro-1)'
      )
    }
    const response = await client.call<PromptEnvironmentShareResult>(
      PROMPT_ENVIRONMENT_SHARE_METHOD,
      { address: address.trim() }
    )
    printResult(response, json, formatShareResult)
  }
}

export function formatShareResult(result: PromptEnvironmentShareResult): string {
  return result.pairingUrl
}
