import { mainI18n, translateMain } from '../i18n/main-i18n'
export type GpuAccelerationAboutPanelOptions = {
  appName: string
  appVersion: string
  platform: NodeJS.Platform
  gpuFallbackActive: boolean
  gpuFeatureStatus: Pick<Electron.GPUFeatureStatus, 'gpu_compositing'> | null
}

export function describeGpuAcceleration(
  gpuFeatureStatus: Pick<Electron.GPUFeatureStatus, 'gpu_compositing'> | null,
  gpuFallbackActive: boolean
): string {
  if (gpuFallbackActive) {
    return translateMain('native.about.gpu.safeMode', 'Disabled (Safe Graphics Mode)')
  }

  const compositing = gpuFeatureStatus?.gpu_compositing.trim().toLowerCase()
  if (!compositing || compositing === 'undefined') {
    return translateMain('native.about.gpu.unknownStatus', 'Status unavailable')
  }
  if (compositing === 'enabled') {
    return translateMain('native.about.gpu.enabled', 'Enabled')
  }
  if (compositing.includes('software')) {
    return translateMain('native.about.gpu.software', 'Software rendering')
  }
  if (compositing.startsWith('disabled')) {
    return translateMain('native.about.gpu.disabled', 'Disabled')
  }
  if (compositing.startsWith('unavailable')) {
    return translateMain('native.about.gpu.unavailable', 'Unavailable')
  }
  return translateMain('native.about.gpu.unknown', 'Unknown ({{status}})', { status: compositing })
}

const COPYRIGHT = 'Copyright © 2026 Runners Co., Ltd. All rights reserved.'
const ORIGINAL_CREDIT = {
  ko: '원본: Orca (Stably AI) · MIT 라이선스',
  en: 'Based on Orca by Stably AI (MIT License)'
} as const

export function createGpuAccelerationAboutPanelOptions({
  appName,
  appVersion,
  platform,
  gpuFallbackActive,
  gpuFeatureStatus
}: GpuAccelerationAboutPanelOptions): Electron.AboutPanelOptionsOptions {
  const status = translateMain('native.about.gpu.summary', 'GPU acceleration: {{status}}', {
    status: describeGpuAcceleration(gpuFeatureStatus, gpuFallbackActive)
  })
  // Same copyright as LICENSE and the mac app's NSHumanReadableCopyright. The Orca credit is
  // written out, not translated: the brand post-processor would turn "Orca" into "Prompt".
  const credit = ORIGINAL_CREDIT[mainI18n.language?.startsWith('ko') ? 'ko' : 'en']
  const lines = [credit, status].join('\n')
  return {
    applicationName: appName,
    applicationVersion: appVersion,
    ...(platform === 'linux'
      ? { copyright: `${COPYRIGHT}\n${lines}` }
      : { credits: lines, copyright: COPYRIGHT })
  }
}
