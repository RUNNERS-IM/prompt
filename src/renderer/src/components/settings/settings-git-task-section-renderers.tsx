import { CommitMessageAiPane } from './CommitMessageAiPane'
import { GitPane } from './GitPane'
import { GitProviderApiBudgetPane } from './GitProviderApiBudgetPane'
import { TasksPane } from './TasksPane'
import { SettingsSection } from './SettingsSection'
import { translate } from '@/i18n/i18n'
import { PROMPT_SIMPLE_SETTINGS } from '@/lib/prompt-hidden-settings'
import type { SettingsRenderContext } from './settings-render-context'

export function renderGitSettingsSection(context: SettingsRenderContext): React.JSX.Element {
  const { model, interactions, navigation, view } = context
  return (
    <SettingsSection
      id="git"
      title={translate('auto.components.settings.Settings.70100f94c7', 'Git & Source Control')}
      description={translate(
        'auto.components.settings.Settings.cfa34f4465',
        'Branch naming, base refs, and Git AI Author.'
      )}
      searchEntries={navigation.getSectionSearchEntries('git')}
      forceVisible={model.hasUnsavedCommitPromptChanges || model.hasUnsavedBranchPromptChanges}
    >
      {view.isSectionMounted('git') ? (
        <>
          <GitPane
            settings={model.settings}
            updateSettings={model.updateSettings}
            writeSourceControlAiSettings={interactions.writeSourceControlAiSettings}
            displayedGitUsername={navigation.displayedGitUsername}
            hasUnsavedBranchPromptChanges={model.hasUnsavedBranchPromptChanges}
            onBranchPromptDirtyChange={model.setHasUnsavedBranchPromptChanges}
            branchPromptDiscardSignal={model.sourceControlAiPromptDiscardSignal}
            settingsSearchQuery={model.settingsSearchQuery}
          />
          {/* Prompt: 소스 제어 AI 명령 틀은 숨기고 지금 값 그대로 쓴다. */}
          {PROMPT_SIMPLE_SETTINGS ? null : (
            <CommitMessageAiPane
              settings={model.settings}
              updateSettings={model.updateSettings}
              writeSourceControlAiSettings={interactions.writeSourceControlAiSettingsOrThrow}
              onCustomPromptDirtyChange={model.setHasUnsavedCommitPromptChanges}
              customPromptDiscardSignal={model.sourceControlAiPromptDiscardSignal}
              settingsSearchQuery={model.settingsSearchQuery}
            />
          )}
          <div className={PROMPT_SIMPLE_SETTINGS ? 'pt-6' : undefined}>
            <GitProviderApiBudgetPane
              settingsSearchQuery={model.settingsSearchQuery}
              target={model.settingsHostScope.target}
            />
          </div>
        </>
      ) : null}
    </SettingsSection>
  )
}

export function renderTasksSettingsSection(context: SettingsRenderContext): React.JSX.Element {
  const { model, navigation, view } = context
  return (
    <SettingsSection
      id="tasks"
      title={translate('auto.components.settings.Settings.11faa2f7dd', 'Task Sources')}
      description={translate(
        'auto.components.settings.Settings.tasksDescription',
        'Connect providers, install the Linear skill, and choose what appears in Tasks.'
      )}
      searchEntries={navigation.getSectionSearchEntries('tasks')}
    >
      {view.isSectionMounted('tasks') ? (
        <TasksPane settings={model.settings} updateSettings={model.updateSettings} />
      ) : null}
    </SettingsSection>
  )
}
