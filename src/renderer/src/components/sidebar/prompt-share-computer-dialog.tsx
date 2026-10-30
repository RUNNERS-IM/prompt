import { useEffect, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { RuntimePairingUrlGenerator } from '../settings/RuntimePairingUrlGenerator'
import {
  clearGeneratedRuntimePairingLink,
  runtimePairingLinkCache
} from '../settings/runtime-pairing-link-state'

/** Reads this Mac's short network name (e.g. m2-pro-1); null when the bridge is missing or fails. */
export async function readPromptLocalHostName(): Promise<string | null> {
  try {
    const name = await window.api.promptComputers?.localHostName?.()
    return typeof name === 'string' && name.trim() ? name.trim() : null
  } catch {
    return null
  }
}

/** Point the share form at "custom address = this Mac's network name" before it mounts. */
export function prefillPromptShareAddress(hostName: string): void {
  if (runtimePairingLinkCache.generatedAddress !== hostName) {
    clearGeneratedRuntimePairingLink()
  }
  runtimePairingLinkCache.intent = 'custom'
  runtimePairingLinkCache.customAddress = hostName
  runtimePairingLinkCache.selectedAddress = hostName
}

/**
 * "Share this computer…" from the computer picker. Settings → Servers is hidden in Prompt, so this
 * is where a link is made. The address is prefilled with the name the other Macs reach this one by.
 */
export function PromptShareComputerDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!open) {
      setReady(false)
      return
    }
    let cancelled = false
    void readPromptLocalHostName().then((hostName) => {
      if (cancelled) {
        return
      }
      if (hostName) {
        prefillPromptShareAddress(hostName)
      }
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl" scrollable>
        <DialogHeader>
          <DialogTitle>
            {translate('prompt.computerPicker.shareTitle', 'Share this computer')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.settings.serverList.shareDialogDescriptionRuns',
              'Anyone with the link can run commands as you on this computer until you revoke it.'
            )}
          </DialogDescription>
        </DialogHeader>
        {ready ? <RuntimePairingUrlGenerator framed={false} showHeader={false} /> : null}
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {translate('auto.components.settings.serverList.done', 'Done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
