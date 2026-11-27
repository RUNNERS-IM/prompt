import type { FeatureTipId } from '../../../../shared/feature-tips'
import type { VoiceSettings } from '../../../../shared/speech-types'

type VoiceDictationToggleOptions = {
  voiceEnabled: boolean
  markFeatureTipsSeen: (ids: FeatureTipId[]) => void
  updateVoiceSettings: (updates: Partial<VoiceSettings>) => void
}

// 앱이 맥 마이크 권한을 더는 갖지 않으므로(2026-11-27) 켤 때 권한을 묻지 않고 설정만 바꾼다.
export function handleVoiceDictationToggle({
  voiceEnabled,
  markFeatureTipsSeen,
  updateVoiceSettings
}: VoiceDictationToggleOptions): void {
  // Toggling proves discovery; later disabling must not make the introduction eligible again.
  markFeatureTipsSeen(['voice-dictation'])
  updateVoiceSettings({ enabled: !voiceEnabled })
}
