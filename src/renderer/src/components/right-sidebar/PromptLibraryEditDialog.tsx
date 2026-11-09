import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'

export type PromptLibraryDraft = { id: string | null; title: string; body: string }

export function PromptLibraryEditDialog({
  draft,
  onSave,
  onCancel
}: {
  draft: PromptLibraryDraft
  onSave: (next: PromptLibraryDraft) => void
  onCancel: () => void
}): React.JSX.Element {
  const [title, setTitle] = useState(draft.title)
  const [body, setBody] = useState(draft.body)
  const canSave = title.trim().length > 0 && body.trim().length > 0
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {draft.id
              ? translate('prompt.library.edit', 'Edit')
              : translate('prompt.library.add', 'New prompt')}
          </DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={translate('prompt.library.nameField', 'Name')}
        />
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={translate('prompt.library.bodyField', 'Prompt')}
          className="min-h-40"
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {translate('prompt.library.cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            disabled={!canSave}
            onClick={() => onSave({ id: draft.id, title: title.trim(), body })}
          >
            {translate('prompt.library.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
