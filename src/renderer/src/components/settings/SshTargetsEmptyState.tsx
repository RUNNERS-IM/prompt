import { translate } from '@/i18n/i18n'
import emptyPanda from '../runners-account/assets/panda/empty.webp'

export function SshTargetsEmptyState(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-card/30 px-4 py-5 text-sm text-muted-foreground">
      <img src={emptyPanda} alt="" className="size-24" draggable={false} />
      {translate('auto.components.settings.SshPane.c0f1c80166', 'No SSH targets configured.')}
    </div>
  )
}
