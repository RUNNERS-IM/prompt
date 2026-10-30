import { useEffect, useState } from 'react'
import { Button } from '../../ui/button'
import { translate } from '@/i18n/i18n'
import { openAppHttpLink } from '@/lib/app-http-link-open'
import { formatPromptDisplayVersion } from '../../../../../shared/prompt-display-version'
import { PROMPT_BLOCK_UPSTREAM_SERVICES } from '../../../../../shared/prompt-upstream'

// Prompt: the update card uses the update wording shared by the RUNNERS apps
// (_docs/작업 가이드/공통.md "화면 문구 말투"): "New version available", [Later] [Install].
// "Install" downloads and then restarts (UpdateCard chains quitAndInstall after the download).
// Versions are shown as 2.6.1030.2; comparisons elsewhere keep the real semver.
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
  const nextVersion = formatPromptDisplayVersion(version)
  return (
    <div className="flex flex-col gap-2.5 p-3.5">
      <h3 className="text-sm font-semibold">
        {translate('prompt.update.title', 'New version available')}
      </h3>
      <p className="text-sm text-muted-foreground">
        {currentVersion
          ? translate(
              'prompt.update.bodyWithCurrent',
              'Prompt {{version}} is ready to install. You have {{current}}. Installing restarts Prompt.',
              { version: nextVersion, current: formatPromptDisplayVersion(currentVersion) }
            )
          : translate(
              'prompt.update.body',
              'Prompt {{version}} is ready to install. Installing restarts Prompt.',
              { version: nextVersion }
            )}
      </p>
      {releaseUrl && (
        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground self-start"
          onClick={(event) => openAppHttpLink(releaseUrl, { event })}
        >
          {translate('auto.components.UpdateCard.44324ef542', 'Release notes')}
        </button>
      )}
      <div className="mt-0.5 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onLater} className="cursor-pointer">
          {translate('prompt.update.later', 'Later')}
        </Button>
        <Button
          size="sm"
          onClick={onInstall}
          className="cursor-pointer bg-[var(--prompt-accent)] text-white hover:bg-[var(--prompt-accent)] hover:opacity-90"
        >
          {translate('prompt.update.install', 'Install')}
        </Button>
      </div>
    </div>
  )
}
