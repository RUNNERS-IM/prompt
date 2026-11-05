type SnapshotSignal = {
  ready: boolean
  claimed: boolean
  promise: Promise<void>
  resolve: () => void
}

function createSignal(): SnapshotSignal {
  let resolve = (): void => undefined
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { ready: false, claimed: false, promise, resolve }
}

let current = createSignal()

export function isAgentStatusStartupSnapshotReady(): boolean {
  return current.ready
}

/** Coordinates the bridge's existing replay; it retains no agent rows. */
export function registerAgentStatusStartupSnapshot(): {
  reset: () => void
  settle: () => void
  dispose: () => void
} {
  if (current.claimed) {
    current.resolve()
    current = createSignal()
  }
  let owned = current
  owned.claimed = true
  return {
    reset: () => {
      if (current !== owned) {
        return
      }
      owned.resolve()
      owned = createSignal()
      owned.claimed = true
      current = owned
    },
    settle: () => {
      if (current !== owned) {
        return
      }
      owned.ready = true
      owned.resolve()
    },
    dispose: () => {
      if (current !== owned) {
        return
      }
      owned.resolve()
      current = createSignal()
    }
  }
}

/**
 * How long a restoring pane waits for the agent rows before it reattaches without them, and so
 * without resuming the conversation. A busy Mac (many sessions starting at once after an update)
 * took longer than the earlier 5 seconds and restored plain shells.
 */
export const AGENT_STATUS_STARTUP_SNAPSHOT_WAIT_MS = 20_000

export async function awaitAgentStatusStartupSnapshot(
  timeoutMs = AGENT_STATUS_STARTUP_SNAPSHOT_WAIT_MS
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!current.ready) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      current.promise,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, remaining)
      })
    ])
    clearTimeout(timer)
  }
}
