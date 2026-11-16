import { describe, expect, it } from 'vitest'
import { claudeUsageLimitScreen } from './claude-usage-limit-screen'

describe('claudeUsageLimitScreen', () => {
  it('names the limit picker Claude waits on', () => {
    expect(
      claudeUsageLimitScreen([
        "  ⎿ You've hit your weekly limit · resets Nov 21 at 12pm",
        '* Baked for 1s · done 4:04 AM',
        ' What do you want to do?',
        ' ❯ 1. Stop and wait for limit to reset',
        '   2. Wait here, then continue automatically at Nov 21',
        '   3. Switch to usage credits',
        ' Enter to confirm · Esc to cancel'
      ])
    ).toBe('picker')
  })

  it('names a session whose last lines say it stopped at the limit', () => {
    expect(claudeUsageLimitScreen(['> go', 'Stopped for limit · resets 3pm', '❯ '])).toBe('stopped')
  })

  it('ignores a limit far up in the scrollback', () => {
    const lines = [
      "You've hit your weekly limit",
      ...Array.from({ length: 20 }, (_, i) => `line ${i}`)
    ]
    expect(claudeUsageLimitScreen(lines)).toBeNull()
  })
})
