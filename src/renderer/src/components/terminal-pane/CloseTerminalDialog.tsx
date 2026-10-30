import { useId, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'

export type CloseTerminalDialogCopyKind = 'command' | 'agent' | 'chat-agent'

export default function CloseTerminalDialog({
  open,
  copyKind = 'command',
  tabLabel,
  subjectKey,
  onCancel,
  onConfirm
}: {
  open: boolean
  copyKind?: CloseTerminalDialogCopyKind
  /** Prompt: the session name shown in the title (see useCloseDialogSessionName). */
  tabLabel?: string
  /** Changing queued subject clears the previous tab’s opt-out without reopening the dialog. */
  subjectKey?: string
  onCancel: () => void
  onConfirm: (dontAskAgain: boolean) => void
}): React.JSX.Element {
  const checkboxId = useId()
  const [dontAskAgain, setDontAskAgain] = useState(false)
  const [previousOpen, setPreviousOpen] = useState(open)
  const [previousSubjectKey, setPreviousSubjectKey] = useState(subjectKey)

  // Reset each new confirmation before paint to avoid flashing the previous opt-out.
  if (open !== previousOpen) {
    setPreviousOpen(open)
    if (open) {
      setDontAskAgain(false)
    }
  }

  // Queued subjects change without reopening; ignore closing-to-undefined so the checkbox cannot flash during exit.
  if (subjectKey !== previousSubjectKey) {
    setPreviousSubjectKey(subjectKey)
    if (subjectKey !== undefined) {
      setDontAskAgain(false)
    }
  }

  const trimmedTabLabel = tabLabel?.trim()

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onCancel()
        }
      }}
    >
      <DialogContent className="max-w-sm" showCloseButton={false}>
        <CloseTerminalDialogBody
          copyKind={copyKind}
          trimmedTabLabel={trimmedTabLabel}
          checkboxId={checkboxId}
          dontAskAgain={dontAskAgain}
          setDontAskAgain={setDontAskAgain}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      </DialogContent>
    </Dialog>
  )
}

// Keep translation and element construction behind the dialog portal's mount boundary.
function CloseTerminalDialogBody({
  copyKind,
  trimmedTabLabel,
  checkboxId,
  dontAskAgain,
  setDontAskAgain,
  onCancel,
  onConfirm
}: {
  copyKind: CloseTerminalDialogCopyKind
  trimmedTabLabel: string | undefined
  checkboxId: string
  dontAskAgain: boolean
  setDontAskAgain: (value: boolean) => void
  onCancel: () => void
  onConfirm: (dontAskAgain: boolean) => void
}): React.JSX.Element {
  // Prompt: one plain shape for every kind: "Close '<name>'?", one line on what stops, a
  // "Don't ask again" box (off at first), Cancel / Close.
  const isCommand = copyKind === 'command'
  return (
    <>
      <DialogHeader>
        <DialogTitle className="truncate text-sm" title={trimmedTabLabel}>
          {trimmedTabLabel
            ? translate('prompt.closeSession.titleNamed', "Close '{{name}}'?", {
                name: trimmedTabLabel
              })
            : translate('prompt.closeSession.titleUnnamed', 'Close this session?')}
        </DialogTitle>
        <DialogDescription className="text-xs">
          {isCommand
            ? translate(
                'prompt.closeSession.commandDescription',
                'The command running in it will stop.'
              )
            : translate(
                'prompt.closeSession.agentDescription',
                'Its work will stop. The conversation is kept, so you can pick it up later.'
              )}
        </DialogDescription>
      </DialogHeader>
      <div className="flex items-center gap-2">
        <Checkbox
          id={checkboxId}
          checked={dontAskAgain}
          onCheckedChange={(checked) => setDontAskAgain(checked === true)}
        />
        <Label htmlFor={checkboxId} className="text-xs font-normal text-muted-foreground">
          {translate('prompt.closeSession.dontAskAgain', "Don't ask again")}
        </Label>
      </div>
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          {translate('auto.components.terminal.pane.CloseTerminalDialog.1d1a7a9c1f', 'Cancel')}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          autoFocus
          onClick={() => onConfirm(dontAskAgain)}
        >
          {translate('prompt.closeSession.confirm', 'Close')}
        </Button>
      </DialogFooter>
    </>
  )
}
