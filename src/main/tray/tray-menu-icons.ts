import { nativeImage, type NativeImage } from 'electron'
import appWindowPath from '../../../resources/tray/menu/app-windowTemplate.png?asset&asarUnpack'
import appWindowRetinaPath from '../../../resources/tray/menu/app-windowTemplate@2x.png?asset&asarUnpack'
import circleHelpPath from '../../../resources/tray/menu/circle-helpTemplate.png?asset&asarUnpack'
import circleHelpRetinaPath from '../../../resources/tray/menu/circle-helpTemplate@2x.png?asset&asarUnpack'
import circleXPath from '../../../resources/tray/menu/circle-xTemplate.png?asset&asarUnpack'
import circleXRetinaPath from '../../../resources/tray/menu/circle-xTemplate@2x.png?asset&asarUnpack'
import infoPath from '../../../resources/tray/menu/infoTemplate.png?asset&asarUnpack'
import infoRetinaPath from '../../../resources/tray/menu/infoTemplate@2x.png?asset&asarUnpack'
import refreshCwPath from '../../../resources/tray/menu/refresh-cwTemplate.png?asset&asarUnpack'
import refreshCwRetinaPath from '../../../resources/tray/menu/refresh-cwTemplate@2x.png?asset&asarUnpack'
import settingsPath from '../../../resources/tray/menu/settingsTemplate.png?asset&asarUnpack'
import settingsRetinaPath from '../../../resources/tray/menu/settingsTemplate@2x.png?asset&asarUnpack'
import squareXPath from '../../../resources/tray/menu/square-xTemplate.png?asset&asarUnpack'
import squareXRetinaPath from '../../../resources/tray/menu/square-xTemplate@2x.png?asset&asarUnpack'
import statusDotGreenPath from '../../../resources/tray/menu/status-dot-green.png?asset&asarUnpack'
import statusDotGreenRetinaPath from '../../../resources/tray/menu/status-dot-green@2x.png?asset&asarUnpack'

// 메뉴바 메뉴 줄 아이콘. 규칙: _docs/작업 가이드/공통.md 「메뉴바 메뉴와 아이콘」(Lucide, 선 굵기 1.5, 16pt).
// PNG 는 config/scripts/prompt-render-tray-menu-icons.mjs 가 만든다.
export type TrayMenuIconName =
  | 'status-dot-green'
  | 'app-window'
  | 'info'
  | 'refresh-cw'
  | 'settings'
  | 'circle-help'
  | 'square-x'
  | 'circle-x'

const ICON_PATHS: Record<
  TrayMenuIconName,
  { path: string; retinaPath: string; template: boolean }
> = {
  // 상태 점만 색이 있어야 해서 template 이 아니다.
  'status-dot-green': {
    path: statusDotGreenPath,
    retinaPath: statusDotGreenRetinaPath,
    template: false
  },
  'app-window': { path: appWindowPath, retinaPath: appWindowRetinaPath, template: true },
  info: { path: infoPath, retinaPath: infoRetinaPath, template: true },
  'refresh-cw': { path: refreshCwPath, retinaPath: refreshCwRetinaPath, template: true },
  settings: { path: settingsPath, retinaPath: settingsRetinaPath, template: true },
  'circle-help': { path: circleHelpPath, retinaPath: circleHelpRetinaPath, template: true },
  'square-x': { path: squareXPath, retinaPath: squareXRetinaPath, template: true },
  'circle-x': { path: circleXPath, retinaPath: circleXRetinaPath, template: true }
}

const cache = new Map<TrayMenuIconName, NativeImage | null>()

/** 맥 메뉴 줄 아이콘. 그림을 못 읽으면 아이콘 없이 줄만 보이도록 undefined 를 준다. */
export function trayMenuIcon(name: TrayMenuIconName): NativeImage | undefined {
  if (process.platform !== 'darwin') {
    // Windows 메뉴는 template 색 바꾸기가 없어 검은 선이 어두운 메뉴에서 안 보인다.
    return undefined
  }
  if (!cache.has(name)) {
    cache.set(name, loadIcon(name))
  }
  return cache.get(name) ?? undefined
}

function loadIcon(name: TrayMenuIconName): NativeImage | null {
  const { path, retinaPath, template } = ICON_PATHS[name]
  try {
    const image = nativeImage.createFromPath(path)
    if (image.isEmpty()) {
      return null
    }
    const retina = nativeImage.createFromPath(retinaPath)
    if (!retina.isEmpty()) {
      image.addRepresentation({ scaleFactor: 2, dataURL: retina.toDataURL() })
    }
    image.setTemplateImage(template)
    return image
  } catch (error) {
    console.warn(`[system-tray] menu icon ${name} could not be loaded`, error)
    return null
  }
}
