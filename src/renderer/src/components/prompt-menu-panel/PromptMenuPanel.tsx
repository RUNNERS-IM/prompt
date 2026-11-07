import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import {
  AppWindow,
  CircleHelp,
  CircleX,
  Download,
  Info,
  Power,
  RefreshCw,
  Settings,
  SquareX,
  type LucideIcon
} from 'lucide-react'
import {
  promptMenuAcceleratorText,
  type PromptMenuCommandId,
  type PromptMenuIconName,
  type PromptMenuPanelApi,
  type PromptMenuRow
} from '../../../../shared/prompt-menu-panel'
import { MenuHead, MenuItem, MenuSeparator, MenuSwitch } from '../runners-account/runners-menu'

// 맥 메뉴 막대 패널의 화면. 줄 목록은 main 이 번역까지 마쳐 보내고, 여기서는 그리기만 한다.
// 줄 모양은 네 앱 공용 부품(runners-account/runners-menu.tsx)이 그린다. 아이콘은 lucide, 굵기 1.5, 크기 16.

const ICON_SIZE = 16
const ICON_STROKE = 1.5
/** 패널이 열려 있는 동안 터미널 수 줄을 새로 읽는 간격(기본 메뉴의 2초와 같음). */
const REFRESH_MS = 2000

const ICONS: Record<PromptMenuIconName, LucideIcon> = {
  'app-window': AppWindow,
  power: Power,
  download: Download,
  info: Info,
  'refresh-cw': RefreshCw,
  settings: Settings,
  'circle-help': CircleHelp,
  'square-x': SquareX,
  'circle-x': CircleX
}

function Icon({ name }: { name: PromptMenuIconName }): React.JSX.Element {
  const Glyph = ICONS[name]
  return <Glyph size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
}

export function PromptMenuPanel({ api }: { api: PromptMenuPanelApi }): React.JSX.Element {
  const [rows, setRows] = useState<PromptMenuRow[]>([])
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let alive = true
    const read = (): void => {
      void api
        .rows()
        .then((next) => {
          if (alive) {
            setRows(next)
          }
        })
        .catch(() => undefined)
    }
    read()
    const offShown = api.onShown((next) => setRows(next))
    // 보이는 동안만 다시 읽는다: 닫힌 패널은 아무 일도 하지 않는다.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        read()
      }
    }, REFRESH_MS)
    window.addEventListener('focus', read)
    return () => {
      alive = false
      offShown()
      clearInterval(timer)
      window.removeEventListener('focus', read)
    }
  }, [api])

  // 창 높이를 내용 높이에 맞춘다(고정 높이면 마지막 줄 아래가 비거나 잘린다).
  useEffect(() => {
    const node = panelRef.current
    if (!node) {
      return
    }
    const observer = new ResizeObserver(() =>
      api.fitHeight(Math.ceil(node.getBoundingClientRect().height))
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [api])

  const run = (id: PromptMenuCommandId): void => {
    void api
      .run(id)
      .then((next) => {
        if (next) {
          setRows(next)
        }
      })
      .catch(() => undefined)
  }

  return (
    <main ref={panelRef} className="prompt-menu-panel">
      {rows.map((row, index) => {
        switch (row.kind) {
          case 'separator':
            return <MenuSeparator key={`separator-${index}`} />
          case 'head':
            return <MenuHead key="head" name={row.name} sub={row.sub} />
          case 'info':
            return (
              <div key={`info-${index}`} className="rm-item prompt-menu-info">
                {row.dot ? <span className="prompt-menu-dot" aria-hidden /> : null}
                <span className="rm-label">{row.label}</span>
              </div>
            )
          case 'toggle':
            return (
              <MenuSwitch
                key={row.id}
                icon={<Icon name={row.icon} />}
                label={row.label}
                checked={row.checked}
                onChange={() => run(row.id)}
              />
            )
          case 'command':
            return (
              <MenuItem
                key={row.id}
                icon={<Icon name={row.icon} />}
                label={<span title={row.toolTip}>{row.label}</span>}
                trailing={row.accelerator ? promptMenuAcceleratorText(row.accelerator) : undefined}
                onSelect={() => run(row.id)}
              />
            )
        }
      })}
    </main>
  )
}
