import { lazy } from 'react'
import { ModalBoundary } from '@/app-shell/app-root-surface-boundaries'
import { useAppStore } from '@/store'

const PromptSkillsDialog = lazy(() => import('./PromptSkillsDialog'))

export function PromptSkillsModal(): React.JSX.Element {
  const visible = useAppStore((state) => state.activeModal === 'prompt-skills')
  return (
    <ModalBoundary boundaryId="modal.prompt-skills" resetKey={visible}>
      <PromptSkillsDialog />
    </ModalBoundary>
  )
}
