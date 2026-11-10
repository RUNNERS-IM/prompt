import { Fragment, type ReactElement, type ReactNode } from 'react'
import { RefreshCw, SlidersHorizontal } from 'lucide-react'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../ui/dropdown-menu'
import { Switch } from '../ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import { SettingsRow, SettingsSubsectionHeader } from '../settings/SettingsFormControls'
import { PROMPT_SIMPLE_SETTINGS } from '@/lib/prompt-hidden-settings'

type UsageFilterRadioGroupProps<Value extends string> = {
  label: ReactNode
  value: Value
  options: readonly { value: Value; label: ReactNode }[]
  onValueChange: (value: Value) => void | Promise<void>
}

export function UsageFilterRadioGroup<Value extends string>({
  label,
  value,
  options,
  onValueChange
}: UsageFilterRadioGroupProps<Value>): React.JSX.Element {
  return (
    <>
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={value}
        onValueChange={(nextValue) => void onValueChange(nextValue as Value)}
      >
        {options.map((option) => (
          <DropdownMenuRadioItem key={option.value} value={option.value}>
            {option.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  )
}

type UsageTrackingPaneShellProps = {
  title: ReactNode
  enableLabel: string
  onEnabledChange: (enabled: boolean) => void
} & (
  | {
      enabled: false
      disabledDescription: ReactNode
    }
  | {
      enabled: true
      status: ReactNode
      isRefreshing: boolean
      hasData: boolean
      optionsLabel: string
      filtersLabel: ReactNode
      refreshAriaLabel: string
      refreshLabel: ReactNode
      filterSections: readonly ReactElement[]
      selectionSummary: ReactNode
      emptyMessage: ReactNode
      onRefresh: () => void | Promise<void>
      headerAction?: ReactNode
      children: ReactNode
    }
)

export function UsageTrackingPaneShell(props: UsageTrackingPaneShellProps): React.JSX.Element {
  if (PROMPT_SIMPLE_SETTINGS) {
    return <PromptUsageTrackingGroup {...props} />
  }
  if (!props.enabled) {
    return (
      <div className="rounded-lg border border-border/60 bg-card/40 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">{props.title}</h3>
            <p className="text-sm text-muted-foreground">{props.disabledDescription}</p>
          </div>
          <Switch
            checked={false}
            aria-label={props.enableLabel}
            onCheckedChange={props.onEnabledChange}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-card/30 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">{props.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{props.status}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start">
          <UsageTrackingPaneActions {...props} />
          <Switch checked aria-label={props.enableLabel} onCheckedChange={props.onEnabledChange} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{props.selectionSummary}</p>
      </div>

      {!props.hasData ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-card/30 px-4 py-6 text-sm text-muted-foreground">
          {props.emptyMessage}
        </div>
      ) : (
        props.children
      )}
    </div>
  )
}

type EnabledUsageTrackingPaneShellProps = Extract<UsageTrackingPaneShellProps, { enabled: true }>

function UsageTrackingPaneActions(props: EnabledUsageTrackingPaneShellProps): React.JSX.Element {
  return (
    <>
      {props.headerAction}
      <DropdownMenu>
        <TooltipProvider delayDuration={250}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label={props.optionsLabel}>
                  <SlidersHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {props.filtersLabel}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenuContent align="end" className="w-60">
          {props.filterSections.map((section, index) => (
            <Fragment key={section.key}>
              {index > 0 && <DropdownMenuSeparator />}
              {section}
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => void props.onRefresh()}
              disabled={props.isRefreshing}
              aria-label={props.refreshAriaLabel}
            >
              <RefreshCw className={`size-3.5 ${props.isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {props.refreshLabel}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  )
}

// Prompt 설정 창: 제목은 묶음 제목으로, 켜기 · 거르기 · 새로 고침은 첫 줄로, 내용은 그 아래 칸들로 둔다.
function PromptUsageTrackingGroup(props: UsageTrackingPaneShellProps): React.JSX.Element {
  if (!props.enabled) {
    return (
      <>
        <SettingsSubsectionHeader title={props.title} />
        <SettingsRow
          label={props.enableLabel}
          description={props.disabledDescription}
          control={
            <Switch
              checked={false}
              aria-label={props.enableLabel}
              onCheckedChange={props.onEnabledChange}
            />
          }
        />
      </>
    )
  }
  return (
    <>
      <SettingsSubsectionHeader title={props.title} />
      <SettingsRow
        label={props.selectionSummary}
        description={props.status}
        control={
          <div className="flex items-center gap-2">
            <UsageTrackingPaneActions {...props} />
            <Switch
              checked
              aria-label={props.enableLabel}
              onCheckedChange={props.onEnabledChange}
            />
          </div>
        }
      />
      {!props.hasData ? (
        <p className="text-[13px] leading-4 text-muted-foreground">{props.emptyMessage}</p>
      ) : (
        props.children
      )}
    </>
  )
}
