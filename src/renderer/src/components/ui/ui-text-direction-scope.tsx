import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import * as Direction from 'radix-ui/direction'
import { uiTextDirection } from '../../../../shared/ui-text-direction'

// Why a scope, not <html dir>: terminals and the session list stay left-to-right in Arabic.
export function UiTextDirectionScope({ children }: { children: ReactNode }): React.JSX.Element {
  const { i18n } = useTranslation()
  const dir = uiTextDirection(i18n.language)
  return (
    <Direction.Provider dir={dir}>
      <div dir={dir} className="contents">
        {children}
      </div>
    </Direction.Provider>
  )
}
