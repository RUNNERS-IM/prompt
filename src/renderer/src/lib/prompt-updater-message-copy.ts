import { translate } from '@/i18n/i18n'
import { PROMPT_BLOCK_UPSTREAM_SERVICES } from '../../../shared/prompt-upstream'

// Prompt: main sends these install failures as plain English with no message code
// (updater-install-support.ts, updater-install-execution.ts). Match the fixed sentence and keep
// any cause main appended after it, so the card shows the translated sentence.
const INSTALL_FAILURES: readonly { english: string; key: string; fallback: string }[] = [
  {
    english: 'Could not restart to install the update. Quit and reopen Orca, then try again.',
    key: 'prompt.update.restartFailed',
    fallback: 'Could not restart to install the update. Quit and reopen Prompt, then try again.'
  },
  {
    english: 'Could not start the update installer. Orca remains open.',
    key: 'prompt.update.installerFailed',
    fallback: 'Could not start the update installer. Prompt remains open.'
  }
]

export function promptUpdaterInstallFailureText(message: string): string | null {
  if (!PROMPT_BLOCK_UPSTREAM_SERVICES) {
    return null
  }
  for (const { english, key, fallback } of INSTALL_FAILURES) {
    if (message.startsWith(english)) {
      return translate(key, fallback) + message.slice(english.length)
    }
  }
  return null
}
