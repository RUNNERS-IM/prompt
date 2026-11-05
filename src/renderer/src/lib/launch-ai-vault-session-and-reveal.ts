import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { launchAiVaultSessionInNewTab } from './launch-ai-vault-session'
import {
  findLivePaneForProviderSession,
  revealRunningElsewherePane
} from './running-elsewhere-pane'
import { activateAiVaultResumeWorkspace } from '@/components/right-sidebar/ai-vault-session-resume-in-chat-launch'
import { notifyAiVaultSessionQueued } from '@/components/right-sidebar/ai-vault-session-launch-feedback'
import { agentLabel } from '@/components/right-sidebar/ai-vault-session-filters'

export async function launchAiVaultSessionAndReveal(
  args: Parameters<typeof launchAiVaultSessionInNewTab>[0],
  describeFailure: (message: string) => string = (message) => message
): Promise<void> {
  // A second terminal on one conversation interleaves its transcript; go to the open one.
  const holder =
    args.providerSession && !/(^|\s)--fork-session(\s|=|$)/.test(args.command)
      ? findLivePaneForProviderSession(args.agent, args.providerSession, null)
      : null
  if (holder && revealRunningElsewherePane(holder)) {
    toast.info(
      translate(
        'auto.lib.launch.ai.vault.session.runningElsewhere',
        'This conversation is already open, so Prompt moved to its tab.'
      )
    )
    return
  }
  const launch = launchAiVaultSessionInNewTab(args)
  if (launch.tabId === null) {
    const outcome = await launch.runtimeLaunch
    if (outcome.status === 'failed') {
      toast.error(
        describeFailure(outcome.message) ||
          translate(
            'auto.lib.launch.agent.in.new.tab.11cce5cc77',
            'Could not launch {{value0}} in a new terminal.',
            { value0: agentLabel(args.agent) }
          )
      )
      return
    }
  }
  if (useAppStore.getState().activeWorktreeId !== args.worktreeId) {
    activateAiVaultResumeWorkspace(args.worktreeId)
  }
  notifyAiVaultSessionQueued(args.agent)
}
