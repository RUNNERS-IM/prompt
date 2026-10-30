import runnersAppsJson from '../../../../../resources/runners-apps/runners-apps.json'
import { buildRunnersAppGroups, type RunnersAppGroup } from './runners-apps-model'

// The list and its icons are bundled into the renderer, so the cards show without a network.
// To swap a logo, replace the file of the same name in resources/runners-apps/ (64x64 PNG).
const ICON_URLS = import.meta.glob<string>('../../../../../resources/runners-apps/*.png', {
  eager: true,
  query: '?url',
  import: 'default'
})

function resolveBundledIcon(fileName: string): string | undefined {
  return ICON_URLS[`../../../../../resources/runners-apps/${fileName}`]
}

export function loadPromptRunnersAppGroups(): RunnersAppGroup[] {
  return buildRunnersAppGroups(runnersAppsJson, {
    selfId: 'prompt',
    resolveIcon: resolveBundledIcon
  })
}

/** Opens a card link in the default browser through the existing shell:openUrl IPC. */
export function openRunnersAppUrl(url: string): void {
  void window.api.shell.openUrl(url)
}
