import { z } from 'zod'
import { defineMethod, type RpcContext } from '../core'
import {
  PROMPT_ENVIRONMENT_SHARE_METHOD,
  type PromptEnvironmentShareResult
} from '../../../../shared/prompt-computers'
import {
  createPromptRuntimeShareOffer,
  getPromptRuntimeShareServer
} from '../../../prompt-computers/prompt-runtime-share'

const PromptEnvironmentShareParamsSchema = z.object({
  address: z.string().min(1).max(255)
})

/**
 * Only the `orca` CLI on this computer may mint a link: its requests come over the owner-only
 * Unix socket, which stamps no client kind and no paired device. Paired desktops, phones and web
 * clients all arrive over the WebSocket with both set, so they are refused here, on top of the
 * 'pairing-admin' permission they are never granted.
 */
export function isLocalSocketCaller(
  ctx: Pick<RpcContext, 'caller' | 'clientKind' | 'pairedDeviceId'>
): boolean {
  return (
    ctx.caller?.kind === 'local-cli' &&
    ctx.clientKind === undefined &&
    (ctx.pairedDeviceId === undefined || ctx.pairedDeviceId === '')
  )
}

export const PROMPT_ENVIRONMENT_SHARE_METHODS = [
  defineMethod({
    name: PROMPT_ENVIRONMENT_SHARE_METHOD,
    permission: 'pairing-admin',
    params: PromptEnvironmentShareParamsSchema,
    handler: async (params, ctx): Promise<PromptEnvironmentShareResult> => {
      if (!isLocalSocketCaller(ctx)) {
        throw new Error(
          'Sharing this computer is only available to the orca CLI running on this computer.'
        )
      }
      const server = getPromptRuntimeShareServer()
      if (!server) {
        throw new Error('This Orca runtime cannot create pairing links.')
      }
      return await createPromptRuntimeShareOffer(server, params.address)
    }
  })
]
