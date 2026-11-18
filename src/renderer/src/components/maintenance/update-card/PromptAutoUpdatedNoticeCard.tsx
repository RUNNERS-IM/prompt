import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../ui/button'
import { Card } from '../../ui/card'
import { translate } from '@/i18n/i18n'
import { openAppHttpLink } from '@/lib/app-http-link-open'

type AutoUpdatedNotice = { version: string; releaseUrl: string }

// Prompt: 쉬는 중이나 앱을 끌 때 저절로 깐 뒤 처음 열 때 한 번 「… 로 업데이트했습니다 · 바뀐 점 보기」.
// 닫거나 바뀐 점을 열면 다시 뜨지 않는다. 새 판 카드와 같은 모양 · 문구 체계를 쓴다.
export function PromptAutoUpdatedNoticeCard(): React.JSX.Element | null {
  const [notice, setNotice] = useState<AutoUpdatedNotice | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.api.updater
      .getAutoUpdatedNotice?.()
      .then((value) => {
        if (!cancelled) {
          setNotice(value ?? null)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!notice) {
    return null
  }

  const dismiss = (): void => {
    setNotice(null)
    void window.api.updater.dismissAutoUpdatedNotice?.().catch(() => {})
  }

  return (
    <Card
      role="status"
      aria-label={translate('prompt.update.autoUpdatedTitle', 'Updated to {{version}}', {
        version: notice.version
      })}
      className="py-0 gap-0 animate-update-card-enter"
    >
      <div className="flex items-center gap-2 p-4">
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">
            {translate('prompt.update.autoUpdatedTitle', 'Updated to {{version}}', {
              version: notice.version
            })}
          </span>
          <span className="text-muted-foreground"> · </span>
          <button
            type="button"
            className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
            onClick={(event) => {
              openAppHttpLink(notice.releaseUrl, { event })
              dismiss()
            }}
          >
            {translate('prompt.update.releaseNotes', 'What changed')}
          </button>
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="-mr-1.5 size-7 shrink-0"
          onClick={dismiss}
          aria-label={translate('prompt.update.dismiss', 'Close')}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </Card>
  )
}
