import { translate } from '@/i18n/i18n'

const STORED_DEFAULT_TITLE = /^Terminal (\d+)$/

/** Saved titles stay "Terminal N" because default-name checks, the CLI and mobile read them; only the screen translates. */
export function localizedTerminalTitle(title: string): string {
  const number = STORED_DEFAULT_TITLE.exec(title.trim())?.[1]
  return number
    ? translate(
        'auto.components.status.bar.resourceSessionLabels.terminalNumber',
        'Terminal {{number}}',
        {
          number
        }
      )
    : title
}
