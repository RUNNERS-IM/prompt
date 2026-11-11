import React, { useMemo, useState } from 'react'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { insertTextIntoActiveTerminal } from '@/components/skills/skill-terminal-insert'
import { useAppStore } from '@/store'
import type { PromptLibraryItem } from '../../../../shared/prompt-library-types'
import { PromptLibraryEditDialog, type PromptLibraryDraft } from './PromptLibraryEditDialog'
import { filterPromptLibrary, savePromptLibraryDraft } from './prompt-library-list'

const NO_PROMPTS: readonly PromptLibraryItem[] = []

function insertPrompt(prompt: PromptLibraryItem): void {
  const result = insertTextIntoActiveTerminal(prompt.body)
  if (result === 'no-terminal') {
    toast.error(translate('prompt.library.noTerminal', 'Open a terminal session first'))
  } else if (result === 'chat-view') {
    toast.error(
      translate('prompt.library.chatView', 'Switch this session to the terminal to use a prompt')
    )
  }
}

export default function PromptLibraryPanel(): React.JSX.Element {
  useUiLanguageRevision()
  const prompts = useAppStore((s) => s.settings?.promptLibrary ?? NO_PROMPTS)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<PromptLibraryDraft | null>(null)
  const visible = useMemo(() => filterPromptLibrary(prompts, query), [prompts, query])

  const save = (next: PromptLibraryDraft): void => {
    setDraft(null)
    void updateSettings({ promptLibrary: savePromptLibraryDraft(prompts, next, Date.now()) })
  }
  const remove = (id: string): void => {
    void updateSettings({ promptLibrary: prompts.filter((prompt) => prompt.id !== id) })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 px-2 pt-2 pb-1">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={translate('prompt.library.search', 'Search prompts')}
            className="h-7 pl-6 text-xs"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground"
          aria-label={translate('prompt.library.add', 'New prompt')}
          onClick={() => setDraft({ id: null, title: '', body: '' })}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      {prompts.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <div className="text-[13px] text-foreground">
            {translate('prompt.library.emptyTitle', 'No saved prompts yet')}
          </div>
          <div className="text-xs leading-5 text-muted-foreground">
            {translate(
              'prompt.library.emptyBody',
              'Save prompts you use often, then click one to put it in the input line.'
            )}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
          {visible.map((prompt) => (
            <div key={prompt.id} className="group relative rounded-md hover:bg-accent/60">
              <button
                type="button"
                className="w-full rounded-md px-2 py-1.5 text-left"
                onClick={() => insertPrompt(prompt)}
              >
                <div className="truncate pr-12 text-[13px] text-foreground">{prompt.title}</div>
                <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                  {prompt.body}
                </div>
              </button>
              <div className="absolute top-1 right-1 hidden gap-0.5 group-focus-within:flex group-hover:flex">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={translate('prompt.library.edit', 'Edit')}
                  onClick={() => setDraft(prompt)}
                >
                  <Pencil className="size-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={translate('prompt.library.delete', 'Delete')}
                  onClick={() => remove(prompt.id)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {draft ? (
        <PromptLibraryEditDialog draft={draft} onSave={save} onCancel={() => setDraft(null)} />
      ) : null}
    </div>
  )
}
