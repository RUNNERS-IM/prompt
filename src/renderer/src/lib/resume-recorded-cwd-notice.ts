import { translate } from '@/i18n/i18n'

/** The terminal line printed when a session resumes in its tab folder, not where it last ran. */
export function resumeRecordedCwdNotice(recordedCwd: string): string {
  return translate(
    'prompt.sessionRow.resumedInTabFolder',
    '[Prompt] Continuing in this folder, not {{folder}} where it last ran',
    // Why: the line goes to a shell, so the path must stay as typed, not HTML-escaped.
    { folder: recordedCwd, interpolation: { escapeValue: false } }
  )
}
