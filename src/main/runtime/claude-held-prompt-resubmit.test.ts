import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAgentPromptSubmissionRuntime } from './agent-prompt-submission-runtime-test-fixture'

vi.mock('../git/worktree', () => {
  const worktrees = [
    {
      path: '/tmp/worktree-a',
      head: 'abc',
      branch: 'feature/prompt-verification',
      isBare: false,
      isMainWorktree: false
    }
  ]
  return {
    listWorktrees: vi.fn().mockResolvedValue(worktrees),
    listWorktreesStrict: vi.fn().mockResolvedValue(worktrees)
  }
})

const PROMPT = 'reply with the word ready and nothing else'
// Claude Code swaps its idle `✳` title for a spinner once a turn starts.
const CLAUDE_TURN_STARTED = '\x1b]0;⠂ Claude Code\x07'

// An idle Claude (after an auto-compact, with a background shell) dropped `session send`'s Enter,
// leaving the prompt in its composer for hours while the send reported only input_accepted.
describe('a Claude prompt whose first Enter was dropped', () => {
  afterEach(() => vi.useRealTimers())

  async function sendToClaude(draft: string | undefined, acceptingEnter: number) {
    vi.useFakeTimers()
    let submitted = false
    const { runtime, handle, writes } = await createAgentPromptSubmissionRuntime(
      (runtime, data) => {
        if (data === '\r' && writes.filter((write) => write === '\r').length === acceptingEnter) {
          submitted = true
          runtime.onPtyData('pty-prompt', CLAUDE_TURN_STARTED, Date.now())
        }
      },
      'claude'
    )
    Object.defineProperty(runtime, 'readCurrentTerminalWaitScreen', {
      value: async () => ({ lines: [], draft: submitted ? undefined : draft })
    })
    const submission = runtime.sendTerminalAgentPrompt(handle, PROMPT, {
      inputKind: 'driving',
      composerReady: true,
      acceptQueued: true,
      requestId: 'claude-idle-send',
      observationTimeoutMs: 0
    })
    await vi.runAllTimersAsync()
    await expect(submission).resolves.toMatchObject({ accepted: true })
    return writes.filter((write) => write === '\r').length
  }

  it('presses Enter again while the composer still holds the prompt', async () => {
    await expect(sendToClaude(PROMPT, 2)).resolves.toBe(2)
  })

  it('keeps pressing until a later Enter starts the turn', async () => {
    await expect(sendToClaude(PROMPT, 3)).resolves.toBe(3)
  })

  it.each([
    { composer: 'is empty', draft: undefined },
    { composer: "holds the user's own text", draft: 'also fix the readme typo' }
  ])('never presses Enter again when the composer $composer', async ({ draft }) => {
    await expect(sendToClaude(draft, Infinity)).resolves.toBe(1)
  })

  it('stops at the retry window when the composer never lets go', async () => {
    const enters = await sendToClaude(PROMPT, Infinity)
    // 20 s at one Enter per 1.5 s, plus the first.
    expect(enters).toBeGreaterThan(2)
    expect(enters).toBeLessThanOrEqual(1 + Math.ceil(20_000 / 1_500))
  })
})
