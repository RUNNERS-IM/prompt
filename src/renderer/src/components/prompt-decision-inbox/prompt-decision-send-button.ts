import { toast } from 'sonner'
import { absolutePathToFileUri } from '@/components/editor/markdown-internal-links'
import { translate } from '@/i18n/i18n'
import { sendMessageToAgent } from '@/lib/agent-message-send'
import type { PromptDecisionDraft } from '../../../../shared/prompt-decision-inbox'
import { findPromptDecisionSession } from './prompt-decision-draft-open'
import {
  getPromptDecisionDraftByFileUrl,
  isPromptDecisionDraftSent,
  loadPromptDecisionDrafts,
  markPromptDecisionDraftSent
} from './prompt-decision-inbox-store'

const MAX_ANSWER_LENGTH = 8000

/** Resolves with the page's answer on a real click; isTrusted keeps the page's own script from sending. */
function armSendButtonScript(label: string): string {
  return `new Promise((resolve) => {
    const out = document.getElementById('choice-out')
    const copy = document.getElementById('choice-copy')
    if (!out || !copy) { resolve(null); return }
    document.getElementById('prompt-decision-send')?.remove()
    const send = document.createElement('button')
    send.id = 'prompt-decision-send'
    send.textContent = ${JSON.stringify(label)}
    send.style.background = '#1565c0'
    send.style.whiteSpace = 'nowrap'
    send.addEventListener('click', (event) => {
      if (event.isTrusted) resolve(out.textContent)
    })
    copy.before(send)
  })`
}

function showSentScript(label: string): string {
  return `(() => {
    const send = document.getElementById('prompt-decision-send')
    if (send) { send.textContent = ${JSON.stringify(label)}; send.disabled = true; send.style.opacity = '.6' }
  })()`
}

async function copyAfterFailure(session: string, answer: string): Promise<void> {
  await window.api.ui.writeClipboardText(answer)
  toast.error(
    translate('prompt.decisionInbox.sendFailed', "Couldn't send to {{session}}", { session }),
    {
      description: translate(
        'prompt.decisionInbox.copiedInstead',
        'Your answer is copied. Paste it into the session.'
      )
    }
  )
}

/** True when the answer reached the session, so the page must not offer to send it twice. */
async function sendAnswer(draft: PromptDecisionDraft, answer: string): Promise<boolean> {
  const session = draft.sessionName
  const target = findPromptDecisionSession(session)
  if (!target) {
    await copyAfterFailure(session, answer)
    return false
  }
  const result = await sendMessageToAgent({
    worktreeId: target.worktreeId,
    target: { kind: 'terminal', tabId: target.tabId, leafId: target.leafId },
    prompt: answer
  }).catch(() => null)
  if (result?.status === 'sent') {
    markPromptDecisionDraftSent(draft)
    toast.success(translate('prompt.decisionInbox.sent', 'Sent to {{session}}', { session }))
    return true
  }
  if (result?.status === 'unconfirmed') {
    toast.warning(
      translate(
        'prompt.decisionInbox.unconfirmed',
        "Sent, but {{session}} didn't confirm it arrived",
        { session }
      )
    )
    return false
  }
  await copyAfterFailure(session, answer)
  return false
}

export async function attachPromptDecisionSendButton(webview: Electron.WebviewTag): Promise<void> {
  try {
    const url = webview.getURL()
    if (!url.startsWith('file:')) {
      return
    }
    await loadPromptDecisionDrafts()
    const draft = getPromptDecisionDraftByFileUrl(url, absolutePathToFileUri)
    if (!draft || isPromptDecisionDraftSent(draft)) {
      return
    }
    const label = translate('prompt.decisionInbox.sendTo', 'Send to {{session}}', {
      session: draft.sessionName
    })
    for (;;) {
      const answer: unknown = await webview.executeJavaScript(armSendButtonScript(label))
      if (typeof answer !== 'string' || answer.length > MAX_ANSWER_LENGTH) {
        return
      }
      if (await sendAnswer(draft, answer)) {
        await webview.executeJavaScript(
          showSentScript(translate('prompt.decisionInbox.sentButton', 'Sent'))
        )
        return
      }
    }
  } catch {
    // The page navigated or closed while waiting for a click.
  }
}
