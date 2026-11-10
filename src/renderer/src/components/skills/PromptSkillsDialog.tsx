import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useModalReturnFocus } from '@/hooks/useModalReturnFocus'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import SkillsPage from './SkillsPage'

// Prompt opens Skills over the current session so the terminal behind it stays where it was.
export default function PromptSkillsDialog(): React.JSX.Element {
  const visible = useAppStore((state) => state.activeModal === 'prompt-skills')
  const closeModal = useAppStore((state) => state.closeModal)
  const { captureReturnFocus } = useModalReturnFocus(visible)
  return (
    <Dialog open={visible} onOpenChange={(open) => !open && closeModal()}>
      <DialogContent
        aria-describedby={undefined}
        className="flex h-[min(720px,calc(100vh-4rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
        onOpenAutoFocus={captureReturnFocus}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DialogTitle className="sr-only">
          {translate('auto.components.skills.SkillsPage.f43ad6edf3', 'Skills')}
        </DialogTitle>
        <SkillsPage />
      </DialogContent>
    </Dialog>
  )
}
