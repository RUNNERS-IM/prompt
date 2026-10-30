import { translate } from '@/i18n/i18n'

/** Compact "now / 5m / 3h / 2d" age label shared by agent rows and activity threads. */
export function formatShortTimeAgo(ts: number, now = Date.now()): string {
  const delta = now - ts
  if (delta < 60_000) {
    return translate('prompt.timeAgo.now', 'now')
  }
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 60) {
    return translate('prompt.timeAgo.minutes', '{{value}}m', { value: minutes })
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return translate('prompt.timeAgo.hours', '{{value}}h', { value: hours })
  }
  return translate('prompt.timeAgo.days', '{{value}}d', { value: Math.floor(hours / 24) })
}
