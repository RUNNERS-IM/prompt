import type React from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { SearchableSetting } from '@/components/settings/SearchableSetting'
import { translate } from '@/i18n/i18n'
import { PROMPT_DEFAULT_MODEL_CHOICES, resolvePromptDefaultModelId } from './prompt-default-model'

/** Settings > Agents: the model most sessions run. Tabs and sidebar rows label only the others. */
export function PromptDefaultModelSetting({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
}): React.JSX.Element {
  const title = translate('prompt.defaultModel.title', 'Default model')
  const description = translate(
    'prompt.defaultModel.description',
    'Tabs and sidebar rows show a model name only when a session runs a different model. Hover a tab or row to see its model.'
  )
  return (
    <SearchableSetting
      title={title}
      description={description}
      keywords={['model', 'claude', 'opus', 'sonnet', 'haiku', 'fable', 'default']}
      className="flex items-center justify-between gap-4 py-2"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <Label>{title}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Select
        value={resolvePromptDefaultModelId(settings.promptDefaultClaudeModel)}
        onValueChange={(id) => void updateSettings({ promptDefaultClaudeModel: id })}
      >
        <SelectTrigger
          size="sm"
          className="w-[120px]"
          aria-label={title}
          data-prompt-default-model=""
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROMPT_DEFAULT_MODEL_CHOICES.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              {model.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SearchableSetting>
  )
}
