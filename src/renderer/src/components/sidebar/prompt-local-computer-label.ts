import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { getRendererAppPlatform } from '@/lib/renderer-app-platform'
import { usePublishedMachineName } from '../settings/use-published-machine-name'

/** Mac, PC or computer, as each OS calls the machine (Draw review-1111 4b4074d). */
export function thisComputerTag(): string {
  const platform = getRendererAppPlatform()
  if (platform === 'darwin') {
    return translate('prompt.computerPicker.thisMac', '(this Mac)')
  }
  if (platform === 'win32') {
    return translate('prompt.computerPicker.thisPc', '(this PC)')
  }
  return translate('prompt.computerPicker.thisComputerLinux', '(this computer)')
}

/** This machine's name as the computer picker shows it, without the "(this Mac)" tag. */
export function usePromptLocalComputerName(): string {
  const machineName = useAppStore((s) => s.settings?.machineName ?? '')
  const publishedMachineName = usePublishedMachineName(machineName)
  return publishedMachineName ?? translate('prompt.computerPicker.thisComputer', 'This computer')
}
