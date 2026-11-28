import { describe, expect, it } from 'vitest'
import { compactSkipReason, formatCompact } from './prompt-session-compact'

const RULE = '─'.repeat(40)
const FOOTER = '  ⏵⏵ bypass permissions on (shift+tab to cycle)'
const NOW = 10 * 60 * 60_000
const HOUR_AGO = NOW - 60 * 60_000
const IDLE_MS = 30 * 60_000

function screen(lines: string[], draft?: string) {
  return { tail: lines, ...(draft !== undefined ? { draft } : {}) }
}

const idleScreen = ['  끝났습니다.', '✻ Crunched for 12m 58s · done 1:15 PM', RULE, '❯', RULE, FOOTER]

describe('compactSkipReason', () => {
  it('보내도 되는 쉬는 세션', () => {
    expect(compactSkipReason(screen(idleScreen), HOUR_AGO, NOW, IDLE_MS)).toBeNull()
  })

  it('답을 쓰는 중이면 건너뛴다', () => {
    const working = [
      '✢ Twisting… (3m 11s · ↓ 17.1k tokens)',
      RULE,
      '❯',
      RULE,
      `${FOOTER} · esc to interrupt`
    ]
    expect(compactSkipReason(screen(working), HOUR_AGO, NOW, IDLE_MS)).toBe('working')
  })

  it('입력칸에 글이 있으면 건너뛴다', () => {
    const typed = idleScreen.map((line) => (line === '❯' ? '❯ 이거 고쳐 줘' : line))
    expect(compactSkipReason(screen(typed), HOUR_AGO, NOW, IDLE_MS)).toBe('draft')
    expect(compactSkipReason(screen(idleScreen, '쓰다 만 글'), HOUR_AGO, NOW, IDLE_MS)).toBe(
      'draft'
    )
  })

  it('선택 창이 열려 있으면 건너뛴다', () => {
    const choice = [' Do you want to proceed?', '❯ 1. Yes', '  2. No', FOOTER]
    expect(compactSkipReason(screen(choice), HOUR_AGO, NOW, IDLE_MS)).toBe('draft')
  })

  it('뒤 작업이 있으면 건너뛴다', () => {
    const background = [...idleScreen.slice(0, -1), `${FOOTER} · 1 shell`]
    expect(compactSkipReason(screen(background), HOUR_AGO, NOW, IDLE_MS)).toBe('background')
  })

  it('shift+tab 안내만으로는 뒤 작업으로 보지 않는다', () => {
    expect(compactSkipReason(screen(idleScreen), HOUR_AGO, NOW, IDLE_MS)).toBeNull()
  })

  it('방금 출력한 세션은 쉰 시간이 찰 때까지 건너뛴다', () => {
    expect(compactSkipReason(screen(idleScreen), NOW - 60_000, NOW, IDLE_MS)).toBe('recent')
    expect(compactSkipReason(screen(idleScreen), null, NOW, IDLE_MS)).toBe('recent')
    expect(compactSkipReason(screen(idleScreen), NOW - 60_000, NOW, 0)).toBeNull()
  })

  it('입력칸이 안 보이는 화면에는 보내지 않는다', () => {
    expect(compactSkipReason(screen(['  loading…']), HOUR_AGO, NOW, IDLE_MS)).toBe('unreadable')
  })
})

describe('formatCompact', () => {
  it('맥 칸은 --all-hosts 때만 붙는다', () => {
    const local = formatCompact({
      items: [{ id: 'term_abcdef123', name: '[SPLIT] 개발', outcome: 'would-send' }],
      dryRun: true
    })
    expect(local).toContain('would-send')
    expect(local).not.toMatch(/\bmac\b/i)

    const hosts = formatCompact({
      items: [
        { id: 'term_1', name: 'a', outcome: 'sent', host: 'm1' },
        { id: 'term_2', name: 'b', outcome: 'skipped', reason: 'working', host: 'm1' }
      ],
      hosts: [{ host: 'm1' }, { host: 'm2', skipped: 'ssh timeout' }],
      dryRun: false
    })
    expect(hosts).toContain('skipped (working)')
    expect(hosts).toContain('m2')
  })
})
