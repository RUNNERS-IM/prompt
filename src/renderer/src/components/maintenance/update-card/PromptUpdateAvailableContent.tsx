import { useEffect, useState } from 'react'
import { Minus, X } from 'lucide-react'
import { Button } from '../../ui/button'
import { Progress } from '../../ui/progress'
import { translate } from '@/i18n/i18n'
import { openAppHttpLink } from '@/lib/app-http-link-open'
import { PROMPT_BLOCK_UPSTREAM_SERVICES } from '../../../../../shared/prompt-upstream'

// Prompt: one compact card for "available" and "downloading" (_docs/작업 가이드/공통.md "화면 문구 말투").
// "Install" downloads and then restarts (UpdateCard chains quitAndInstall after the download).
export const PROMPT_UPDATE_CARD = PROMPT_BLOCK_UPSTREAM_SERVICES

function useCurrentAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void window.api.updater
      .getVersion()
      .then((value) => {
        if (!cancelled) {
          setVersion(value)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return version
}

function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)}MB`
}

function PromptUpdateCardHeader({
  title,
  subtitle,
  action
}: {
  title: string
  subtitle: string
  action: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  )
}

export function PromptUpdateAvailableContent({
  version,
  releaseUrl,
  onInstall,
  onLater
}: {
  version: string
  releaseUrl?: string
  onInstall: () => void
  onLater: () => void
}): React.JSX.Element {
  const currentVersion = useCurrentAppVersion()
  return (
    <div className="flex flex-col gap-3 p-4">
      <PromptUpdateCardHeader
        title={translate('prompt.update.titleVersion', 'New version {{version}}', { version })}
        subtitle={
          currentVersion
            ? translate(
                'prompt.update.subtitleWithCurrent',
                'You have {{current}} · Installing restarts Prompt',
                { current: currentVersion }
              )
            : translate('prompt.update.subtitle', 'Installing restarts Prompt')
        }
        action={
          <Button
            variant="ghost"
            size="icon"
            className="-mt-1 -mr-1.5 size-7 shrink-0"
            onClick={onLater}
            aria-label={translate('prompt.update.dismiss', 'Close')}
          >
            <X className="size-3.5" />
          </Button>
        }
      />
      <div className="flex items-center justify-between gap-2">
        {releaseUrl ? (
          <button
            type="button"
            className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
            onClick={(event) => openAppHttpLink(releaseUrl, { event })}
          >
            {translate('prompt.update.releaseNotes', 'What changed')}
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onLater} className="cursor-pointer">
            {translate('prompt.update.later', 'Later')}
          </Button>
          <Button
            size="sm"
            onClick={onInstall}
            data-prompt-accent-button
            className="cursor-pointer"
          >
            {translate('prompt.update.install', 'Install')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function PromptUpdateDownloadingContent({
  version,
  percent,
  transferredBytes,
  totalBytes,
  onCollapse
}: {
  version: string
  percent: number
  transferredBytes?: number
  totalBytes?: number
  onCollapse: () => void
}): React.JSX.Element {
  const pct = Math.max(0, Math.min(100, Math.round(percent)))
  return (
    <div className="flex flex-col gap-3 p-4">
      <PromptUpdateCardHeader
        title={translate('prompt.update.downloadingTitle', 'Downloading version {{version}}', {
          version
        })}
        subtitle={translate(
          'prompt.update.downloadingSubtitle',
          'Prompt restarts when the download finishes'
        )}
        action={
          <Button
            variant="ghost"
            size="icon"
            className="-mt-1 -mr-1.5 size-7 shrink-0"
            onClick={onCollapse}
            aria-label={translate(
              'auto.components.UpdateCard.8acbdd3961',
              'Minimize to status bar'
            )}
          >
            <Minus className="size-3.5" />
          </Button>
        }
      />
      <div className="flex flex-col gap-1.5">
        <Progress value={pct} className="h-1.5" />
        <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
          <span>
            {transferredBytes !== undefined && totalBytes
              ? `${formatMegabytes(transferredBytes)} / ${formatMegabytes(totalBytes)}`
              : ''}
          </span>
          <span>{pct}%</span>
        </div>
      </div>
    </div>
  )
}
