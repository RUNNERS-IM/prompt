import { translate } from '@/i18n/i18n'
import { PROMPT_BLOCK_UPSTREAM_SERVICES } from '../../../../shared/prompt-upstream'

// Prompt does not upload crash reports: "submit" opens a prefilled GitHub issue page and no log
// bundle is attached (src/main/ipc/feedback.ts openPromptFeedbackIssue). The dialog says so
// instead of Orca's "sent" wording and hides the log checkbox.
export const PROMPT_CRASH_REPORT_OPENS_GITHUB = PROMPT_BLOCK_UPSTREAM_SERVICES

export function promptCrashReportTitle(): string {
  return translate('prompt.crashReport.title', 'Report a crash')
}

export function promptCrashReportDescription(): string {
  return translate(
    'prompt.crashReport.description',
    'Opens a new GitHub issue with your notes and the version filled in. A GitHub account is required.'
  )
}

export function promptCrashReportCancelLabel(): string {
  return translate('prompt.crashReport.cancel', 'Cancel')
}

export function promptCrashReportOpenLabel(): string {
  return translate('prompt.crashReport.open', 'Open in GitHub')
}

export function promptCrashReportOpenedMessage(): string {
  return translate(
    'prompt.crashReport.opened',
    'Opened the GitHub issue page. The report is filed once you submit it there.'
  )
}
