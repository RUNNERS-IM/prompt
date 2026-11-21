import { describe, expect, it, vi } from 'vitest'
import type { ClaudeRateLimitAccountsState } from '../../../shared/managed-account-types'

vi.mock('sonner', () => ({ toast: { info: vi.fn() } }))

const { createSystemLoginWatch } = await import('./prompt-claude-system-login-watch')

function state(email: string | undefined, activeId: string | null = null) {
  return {
    accounts: [],
    activeAccountId: activeId,
    activeAccountIdsByRuntime: { host: activeId, wsl: {} },
    ...(email ? { systemDefaultEmail: email } : {})
  } as ClaudeRateLimitAccountsState
}

function setup(sequence: ClaudeRateLimitAccountsState[]) {
  let index = 0
  const restart = vi.fn(async () => ({ sessions: [] }))
  const onChanged = vi.fn()
  const watch = createSystemLoginWatch({
    listAccounts: async () => sequence[Math.min(index++, sequence.length - 1)],
    restart,
    onChanged
  })
  return { watch, restart, onChanged }
}

describe('createSystemLoginWatch', () => {
  it('restarts sessions stopped at the limit when the System default login changes', async () => {
    const { watch, restart, onChanged } = setup([state('a@x.test'), state('b@x.test')])
    await watch.poll()
    expect(restart).not.toHaveBeenCalled()
    await watch.poll()
    expect(restart).toHaveBeenCalledWith({ limitedOnly: true, restartLimited: true })
    expect(onChanged).toHaveBeenCalledWith('b@x.test', { sessions: [] })
  })

  it('does nothing while the same login stays', async () => {
    const { watch, restart } = setup([state('a@x.test'), state('A@x.test')])
    await watch.poll()
    await watch.poll()
    expect(restart).not.toHaveBeenCalled()
  })

  it('ignores the change while a saved account is selected', async () => {
    const { watch, restart } = setup([state('a@x.test', 'acc'), state('b@x.test', 'acc')])
    await watch.poll()
    await watch.poll()
    expect(restart).not.toHaveBeenCalled()
  })

  it('does not restart again for a login the window already followed', async () => {
    const { watch, restart } = setup([state('a@x.test'), state('b@x.test')])
    await watch.poll()
    watch.acknowledge(state('b@x.test'))
    await watch.poll()
    expect(restart).not.toHaveBeenCalled()
  })

  it('waits through a sign-out and restarts once another login comes back', async () => {
    const { watch, restart } = setup([state('a@x.test'), state(undefined), state('b@x.test')])
    await watch.poll()
    await watch.poll()
    expect(restart).not.toHaveBeenCalled()
    await watch.poll()
    expect(restart).toHaveBeenCalledTimes(1)
  })
})
