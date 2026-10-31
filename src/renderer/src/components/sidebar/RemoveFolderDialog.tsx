import React, { useCallback, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import {
  getRepoExecutionHostId,
  isRuntimeOwnedSshTargetId,
  normalizeExecutionHostId
} from '../../../../shared/execution-host'
import { countOpenRepoTerminalTabs } from '@/store/repos/repo-removal'
import { getRecipeVmSshTargetForHost } from '@/lib/recipe-vm-managed-host'
import { RemovalUnsavedFilesNotice } from './RemovalUnsavedFilesNotice'
import { confirmUnsavedDiscard } from '@/store/slices/worktrees/teardown/removed-workspace-unsaved-files'
import { projectRemovalTargets } from './removal-unsaved-files'
import {
  selectDetectedWorktreesByRepo,
  selectWorktreesByRepo
} from '@/store/workspace-record-selectors'

const RemoveFolderDialog = React.memo(function RemoveFolderDialog() {
  useUiLanguageRevision()
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const removeProject = useAppStore((s) => s.removeProject)

  const isOpen = activeModal === 'confirm-remove-folder'
  const repoId = typeof modalData.repoId === 'string' ? modalData.repoId : ''
  const displayName = typeof modalData.displayName === 'string' ? modalData.displayName : ''
  const hostId =
    typeof modalData.hostId === 'string' ? normalizeExecutionHostId(modalData.hostId) : null

  // Remote files remain on the named host’s disk; ghost-host labels explain where recovery is possible.
  const sshConnectionId = useAppStore(
    (s) =>
      s.repos
        .find((repo) => repo.id === repoId && (!hostId || getRepoExecutionHostId(repo) === hostId))
        ?.connectionId?.trim() ?? null
  )
  const sshHostLabel = useAppStore((s) => {
    if (!sshConnectionId) {
      return null
    }
    return (
      s.sshTargetLabels.get(sshConnectionId) ??
      s.removedSshTargetLabels.get(sshConnectionId) ??
      sshConnectionId
    )
  })

  const onRecipeVmServer = useAppStore(
    (s) =>
      getRecipeVmSshTargetForHost(s.runtimeEnvironments, hostId) !== null ||
      (selectWorktreesByRepo(s)[repoId] ?? []).some(
        (worktree) =>
          worktree.hostId === hostId && worktree.ephemeralVmCheckoutMode === 'provisioned-root'
      )
  )

  const worktreesByRepo = useAppStore((s) => selectWorktreesByRepo(s))
  const detectedWorktreesByRepo = useAppStore((s) => selectDetectedWorktreesByRepo(s))
  const unsavedTargets = useMemo(
    () =>
      projectRemovalTargets(
        { worktreesByRepo, detectedWorktreesByRepo },
        repoId ? [{ repoId, hostId }] : []
      ),
    [detectedWorktreesByRepo, hostId, repoId, worktreesByRepo]
  )

  const runningSessionCount = useAppStore((s) =>
    repoId && hostId ? countOpenRepoTerminalTabs(s, repoId, hostId) : 0
  )

  // Say plainly that the whole project goes, not one session, so a session-level intent stops here.
  const sentences = [
    translate(
      'prompt.projectRemoval.wholeProject',
      'This removes the whole project, not just one session.'
    ),
    runningSessionCount === 0
      ? null
      : translate(
          'prompt.projectRemoval.runningSessions',
          'All {{count}} running sessions in it will be stopped.',
          {
            count: runningSessionCount,
            defaultValue_one: 'Its running session will be stopped.'
          }
        ),
    onRecipeVmServer || isRuntimeOwnedSshTargetId(sshConnectionId)
      ? translate(
          'prompt.projectRemoval.filesVmRecipe',
          'Its VM recipe determines whether the environment and its files are permanently deleted.'
        )
      : sshHostLabel
        ? translate(
            'prompt.projectRemoval.filesSsh',
            'Its folder and files stay on {{host}}. Add that SSH host again to bring it back.',
            { host: sshHostLabel }
          )
        : translate(
            'prompt.projectRemoval.filesLocal',
            'Its folder and files stay where they are.'
          ),
    translate(
      'prompt.projectRemoval.closeOneSession',
      'To close just one session, use the × on its row.'
    )
  ].filter((sentence): sentence is string => sentence !== null)

  const handleConfirm = useCallback(() => {
    // Require the opener’s host so same-ID rows on other hosts cannot be removed.
    if (repoId && hostId) {
      void removeProject(repoId, {
        hostId,
        errorFeedback: 'toast',
        confirmedDiscards: confirmUnsavedDiscard(useAppStore.getState, unsavedTargets)
      })
    }
    closeModal()
  }, [closeModal, hostId, removeProject, repoId, unsavedTargets])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        closeModal()
      }
    },
    [closeModal]
  )

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent surface="security" className="max-w-sm sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-sm break-words">
            {translate(
              'prompt.projectRemoval.title',
              "Remove the '{{name}}' project from the list?",
              {
                name: displayName
              }
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">{sentences.join(' ')}</DialogDescription>
        </DialogHeader>
        <RemovalUnsavedFilesNotice targets={unsavedTargets} enabled={isOpen} />
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {translate('auto.components.sidebar.RemoveFolderDialog.d36883e046', 'Cancel')}
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            {translate('prompt.projectRemoval.confirm', 'Remove Project')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

export default RemoveFolderDialog
