import { toast } from 'sonner'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { PROMPT_BLOCK_UPSTREAM_SERVICES } from '../../../../shared/prompt-upstream'

export function CopyTabIdMenuItem({
  unifiedTabId
}: {
  unifiedTabId: string
}): React.JSX.Element | null {
  // Prompt: the copied "orcaTabId: …" line is for Orca's CLI orchestration, which Prompt hides.
  if (PROMPT_BLOCK_UPSTREAM_SERVICES) {
    return null
  }
  const copyTabId = async (): Promise<void> => {
    try {
      await window.api.ui.writeClipboardText(`orcaTabId: ${unifiedTabId}`)
      toast.success(translate('components.tab.bar.CopyTabIdMenuItem.copied', 'Tab ID copied'))
    } catch {
      toast.error(translate('components.tab.bar.CopyTabIdMenuItem.failed', 'Could not copy tab ID'))
    }
  }

  return (
    <DropdownMenuItem inset onSelect={() => void copyTabId()}>
      {translate('components.tab.bar.CopyTabIdMenuItem.copy', 'Copy Tab ID')}
    </DropdownMenuItem>
  )
}
