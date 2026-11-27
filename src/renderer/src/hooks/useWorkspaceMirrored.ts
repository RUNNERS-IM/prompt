import { useTranslation } from 'react-i18next'
import { uiTextDirection } from '../../../shared/ui-text-direction'

/**
 * 아랍어 화면에서 작업 창 틀을 좌우로 뒤집는지(사이드바가 오른쪽, 오른쪽 사이드바가 왼쪽).
 * 터미널 · 편집기 안 글은 뒤집지 않는다(runners-wiki 2026-11-27 1A).
 */
export function useWorkspaceMirrored(): boolean {
  const { i18n } = useTranslation()
  return uiTextDirection(i18n.language) === 'rtl'
}
