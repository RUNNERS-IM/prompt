import { ipcMain } from 'electron'
import { PROMPT_LOCAL_HOST_NAME_CHANNEL } from '../../shared/prompt-computers'
import { readPromptLocalHostName } from './prompt-local-host-name'
import { setPromptRuntimeShareServer, type PromptRuntimeShareServer } from './prompt-runtime-share'
import { setPromptHttpRoutes } from './prompt-http-routes'
import { createTailscaleCli } from './tailnet/tailscale-cli'
import { createTailnetPairRoute } from './tailnet/tailnet-pair-route'
import { TailnetAutoPair } from './tailnet/tailnet-auto-pair'

export type PromptComputerOptions = {
  userDataPath: string
  readMachineName: () => string
  /** Off for E2E and for a sidecar pinned to loopback, which must never widen. */
  tailnetAutoPair: boolean
}

let tailnetAutoPair: TailnetAutoPair | null = null

/** Prompt computer picker: main-process side. One call from runtime startup wires all parts. */
export function registerPromptComputerHandlers(
  runtimeRpc: PromptRuntimeShareServer,
  options?: PromptComputerOptions
): void {
  setPromptRuntimeShareServer(runtimeRpc)
  ipcMain.removeHandler(PROMPT_LOCAL_HOST_NAME_CHANNEL)
  ipcMain.handle(PROMPT_LOCAL_HOST_NAME_CHANNEL, () => readPromptLocalHostName())

  tailnetAutoPair?.stop()
  tailnetAutoPair = null
  setPromptHttpRoutes([])
  if (!options?.tailnetAutoPair || process.env.PROMPT_TAILNET_AUTO_PAIR === '0') {
    return
  }
  const tailscale = createTailscaleCli()
  const ensureNetworkExposure = (): Promise<void> => runtimeRpc.ensureNetworkExposure()
  setPromptHttpRoutes([
    createTailnetPairRoute({
      server: runtimeRpc,
      tailscale,
      readMachineName: options.readMachineName,
      ensureNetworkExposure
    })
  ])
  tailnetAutoPair = new TailnetAutoPair({
    userDataPath: options.userDataPath,
    tailscale,
    ensureNetworkExposure
  })
  tailnetAutoPair.start()
}
