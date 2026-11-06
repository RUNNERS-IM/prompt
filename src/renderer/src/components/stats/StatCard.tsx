import { PROMPT_SIMPLE_SETTINGS } from '@/lib/prompt-hidden-settings'
import { cn } from '@/lib/utils'

type StatCardProps = {
  label: string
  value: string
  icon: React.ReactNode
}

export function StatCard({ label, value, icon }: StatCardProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex items-center gap-3',
        !PROMPT_SIMPLE_SETTINGS && 'rounded-lg border border-border/50 bg-card/60 px-4 py-3'
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-tight text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
