import React, { useMemo, useState } from 'react'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { insertTextIntoActiveTerminal } from '@/components/skills/skill-terminal-insert'
import { useSharedPrompts } from '@/lib/prompt-shared-library-store'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import type { PromptLibraryItem } from '../../../../shared/prompt-library-types'
import emptyBoxPanda from '../../assets/panda-scene/empty_box.webp'
import lostPanda from '../../assets/panda-scene/lost.webp'
import { PromptLibraryEditDialog, type PromptLibraryDraft } from './PromptLibraryEditDialog'
import {
  buildPromptLibrarySections,
  removePromptLibraryItem,
  savePromptLibraryDraft,
  type PromptLibrarySectionKind
} from './prompt-library-list'

const NO_PROMPTS: readonly PromptLibraryItem[] = []
const NO_KEYS: readonly string[] = []

function insertPrompt(body: string): void {
  const result = insertTextIntoActiveTerminal(body)
  if (result === 'no-terminal') {
    toast.error(translate('prompt.library.noTerminal', 'Open a terminal session first'))
  } else if (result === 'chat-view') {
    toast.error(
      translate('prompt.library.chatView', 'Switch this session to the terminal to use a prompt')
    )
  }
}

function sectionTitle(kind: PromptLibrarySectionKind): string {
  if (kind === 'mine') {
    return translate('prompt.library.groupMine', 'Mine')
  }
  if (kind === 'frequent') {
    return translate('prompt.library.groupFrequent', 'Used often')
  }
  return translate('prompt.library.groupShared', 'Shared')
}

// design.runners.im 「상태」: 그림 → 한 줄 → 채운 단추 하나를 가운데에.
function PromptLibraryEmptyState({
  image,
  line,
  onAdd
}: {
  image: string
  line: string
  onAdd: () => void
}): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <img src={image} alt="" className="size-24 object-contain" draggable={false} />
      <div className="text-[15px] font-semibold text-foreground">{line}</div>
      <Button type="button" size="sm" className="mt-2" onClick={onAdd}>
        {translate('prompt.library.add', 'New prompt')}
      </Button>
    </div>
  )
}

export default function PromptLibraryPanel(): React.JSX.Element {
  useUiLanguageRevision()
  const prompts = useAppStore((s) => s.settings?.promptLibrary ?? NO_PROMPTS)
  const dismissed = useAppStore((s) => s.settings?.promptLibraryDismissedAuto ?? NO_KEYS)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const shared = useSharedPrompts()
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<PromptLibraryDraft | null>(null)
  const sections = useMemo(
    () => buildPromptLibrarySections(prompts, shared, query),
    [prompts, shared, query]
  )
  const hasAny = prompts.length > 0 || shared.length > 0
  // 묶음이 하나뿐이면 이름 줄 없이 목록만 보인다.
  const showHeaders = sections.length > 1

  const openNew = (): void => setDraft({ id: null, title: '', body: '' })
  const save = (next: PromptLibraryDraft): void => {
    setDraft(null)
    void updateSettings({ promptLibrary: savePromptLibraryDraft(prompts, next, Date.now()) })
  }
  const remove = (id: string): void => {
    void updateSettings(removePromptLibraryItem(prompts, dismissed, id))
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
          onClick={openNew}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      {!hasAny ? (
        <PromptLibraryEmptyState
          image={emptyBoxPanda}
          line={translate('prompt.library.emptyTitle', 'No saved prompts yet')}
          onAdd={openNew}
        />
      ) : sections.length === 0 ? (
        <PromptLibraryEmptyState
          image={lostPanda}
          line={translate('prompt.library.noResults', 'No prompts match your search')}
          onAdd={openNew}
        />
      ) : (
        <div className="scrollbar-sleek min-h-0 flex-1 overflow-auto px-1 pb-2">
          {sections.map((section) => (
            <div key={section.kind}>
              {showHeaders ? (
                <div className="px-2 pt-2 pb-1 text-[11px] font-bold text-muted-foreground">
                  {sectionTitle(section.kind)}
                </div>
              ) : null}
              {section.rows.map((row) => (
                <div key={row.id} className="group relative rounded-md hover:bg-accent/60">
                  <button
                    type="button"
                    className="w-full rounded-md px-2 py-1.5 text-left"
                    onClick={() => insertPrompt(row.body)}
                  >
                    <div
                      className={cn('truncate text-[13px] text-foreground', row.item && 'pr-12')}
                    >
                      {row.title}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                      {row.body}
                    </div>
                  </button>
                  {row.item ? (
                    <div className="absolute top-1 right-1 hidden gap-0.5 group-focus-within:flex group-hover:flex">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={translate('prompt.library.edit', 'Edit')}
                        onClick={() => setDraft(row.item)}
                      >
                        <Pencil className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={translate('prompt.library.delete', 'Delete')}
                        onClick={() => remove(row.id)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
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
