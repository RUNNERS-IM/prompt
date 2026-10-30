import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { PROMPT_BLOCK_UPSTREAM_SERVICES } from '../../../../shared/prompt-upstream'

// Retain the beta qualifier wherever public builds offer Relay.
export function MobileRelayBetaNotice({ className }: { className?: string }): React.JSX.Element {
  return (
    <p className={cn('text-[11px] text-muted-foreground', className)}>
      {PROMPT_BLOCK_UPSTREAM_SERVICES
        ? // Prompt: relay runs on Orca's servers and is off; say plainly what still works.
          translate(
            'prompt.mobile.directOnly',
            'Relay is off in Prompt. Your phone connects only on the same Wi-Fi as this computer or through Tailscale.'
          )
        : translate(
            'auto.components.settings.MobileRelayBetaNotice.notice',
            'Orca Relay is in beta.'
          )}
    </p>
  )
}
