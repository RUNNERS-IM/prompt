import '../unused-default-rpc-methods.test-fixture'
import { describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { RpcRequest } from '../core'
import { RpcDispatcher } from '../dispatcher'
import { TERMINAL_METHODS } from './terminal'
import { OrcaRuntimeWithFocusTerminal } from '../../terminal/focus/focus-terminal'
import type { ShellTabMoveResult } from '../../../../shared/shell-tab-workspace-move-types'

function request(params: unknown): RpcRequest {
  return { id: 'move-1', authToken: 'token', method: 'terminal.moveToWorkspace', params }
}

function createDispatcher() {
  const moveTerminalToWorkspace = vi.fn(async (handle: string) => ({
    handle,
    tabId: 'tab-1',
    moved: true as const,
    worktreeId: 'repo-2::/src/other'
  }))
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: terminal.moveToWorkspace reads only these two runtime members.
  const runtime = {
    getRuntimeId: () => 'runtime-1',
    moveTerminalToWorkspace
  } as unknown as OrcaRuntimeService
  return {
    moveTerminalToWorkspace,
    dispatcher: new RpcDispatcher({ runtime, methods: TERMINAL_METHODS })
  }
}

describe('terminal.moveToWorkspace', () => {
  it('passes the terminal handle and target workspace selector to the runtime', async () => {
    const { moveTerminalToWorkspace, dispatcher } = createDispatcher()
    const response = await dispatcher.dispatch(
      request({ terminal: 'term_1', worktree: 'id:repo-2::/src/other' })
    )
    expect(moveTerminalToWorkspace).toHaveBeenCalledWith('term_1', 'id:repo-2::/src/other')
    expect(response).toMatchObject({
      ok: true,
      result: { move: { handle: 'term_1', tabId: 'tab-1', moved: true } }
    })
  })

  it('refuses paired clients and missing arguments without touching the window', async () => {
    const { moveTerminalToWorkspace, dispatcher } = createDispatcher()
    expect(
      await dispatcher.dispatch(request({ terminal: 'term_1', worktree: 'id:x' }), {
        clientKind: 'mobile'
      })
    ).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    expect(await dispatcher.dispatch(request({ terminal: 'term_1' }))).toMatchObject({
      ok: false,
      error: { code: 'invalid_argument' }
    })
    expect(moveTerminalToWorkspace).not.toHaveBeenCalled()
  })
})

describe('moveTerminalToWorkspace', () => {
  function fakeRuntime(move?: (tabId: string, target: string) => Promise<ShellTabMoveResult>) {
    return {
      focusTerminal: vi.fn(async (handle: string) => ({
        handle,
        tabId: 'tab-1',
        worktreeId: 'repo-1::/src/app',
        navigated: false
      })),
      resolveWorkspaceSelector: vi.fn(async () => ({ id: 'repo-2::/src/other' })),
      notifier: move ? { moveShellTabToWorkspace: vi.fn(move) } : {}
    }
  }
  const call = (runtime: ReturnType<typeof fakeRuntime>) =>
    OrcaRuntimeWithFocusTerminal.prototype.moveTerminalToWorkspace.call(
      runtime as never,
      'term_1',
      'id:repo-2::/src/other'
    )

  it('asks the window to move the tab without navigating to it first', async () => {
    const runtime = fakeRuntime(async () => ({ moved: false, reason: 'running-program' }))
    expect(await call(runtime)).toEqual({
      handle: 'term_1',
      tabId: 'tab-1',
      moved: false,
      reason: 'running-program'
    })
    expect(runtime.focusTerminal).toHaveBeenCalledWith('term_1', { navigateHost: false })
    expect(runtime.notifier.moveShellTabToWorkspace).toHaveBeenCalledWith(
      'tab-1',
      'repo-2::/src/other'
    )
  })

  it('answers renderer-unavailable when no window can move tabs', async () => {
    expect(await call(fakeRuntime())).toMatchObject({
      moved: false,
      reason: 'renderer-unavailable'
    })
  })
})
