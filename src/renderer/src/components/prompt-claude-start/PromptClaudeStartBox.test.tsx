// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'

const mocks = vi.hoisted(() => ({
  state: {
    settings: { agentPermissionDefault: 'full-access' } as Record<string, unknown>,
    setRightSidebarTab: vi.fn(),
    setRightSidebarOpen: vi.fn()
  },
  start: vi.fn(() => true),
  write: vi.fn(),
  stored: { model: null, effort: null, switches: {} } as Record<string, unknown>,
  sessions: [] as AiVaultSession[]
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
    { getState: () => mocks.state }
  )
}))
vi.mock('./prompt-claude-start-tabs', () => ({
  promptClaudeStartProjectKey: () => 'repo-a',
  readPromptClaudeStartChoices: () => mocks.stored,
  writePromptClaudeStartChoices: mocks.write,
  startPromptClaudeFromBox: mocks.start
}))
vi.mock('./prompt-claude-start-resume', () => ({
  usePromptClaudeResumeSessions: () => mocks.sessions
}))
vi.mock('../../../../shared/agent-permission-env', () => ({
  agentPermissionHostPlatform: () => 'darwin'
}))

import { PromptClaudeStartBox } from './PromptClaudeStartBox'

function renderBox() {
  return render(
    <PromptClaudeStartBox
      tabId="box-tab"
      worktreeId="wt-1"
      worktreePath="/Users/me/git/app"
      isActive
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.settings = { agentPermissionDefault: 'full-access' }
  mocks.stored = { model: null, effort: null, switches: {} }
  mocks.sessions = []
})
afterEach(cleanup)

describe('PromptClaudeStartBox', () => {
  it('shows the header, the folder and the two switches at their defaults', () => {
    renderBox()
    expect(screen.getByText('New Claude Session')).toBeTruthy()
    expect(screen.getByText('~/git/app')).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Use Chrome' }).getAttribute('aria-checked')).toBe(
      'false'
    )
    expect(
      screen.getByRole('switch', { name: 'Skip permissions' }).getAttribute('aria-checked')
    ).toBe('true')
  })

  it('starts with no extra flags on Enter when nothing was changed', () => {
    const { container } = renderBox()
    const box = container.querySelector('[tabindex="-1"]') as HTMLElement
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(mocks.start).toHaveBeenCalledExactlyOnceWith({
      tabId: 'box-tab',
      worktreeId: 'wt-1',
      launch: {}
    })
  })

  it('adds --chrome once the switch is on and remembers it for the project', () => {
    renderBox()
    fireEvent.click(screen.getByRole('switch', { name: 'Use Chrome' }))
    expect(mocks.write).toHaveBeenLastCalledWith('repo-a', {
      model: null,
      effort: null,
      switches: { chrome: true }
    })
    fireEvent.click(screen.getByText('Start New'))
    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        launch: { agentArgs: '--dangerously-skip-permissions --chrome' }
      })
    )
  })

  it('opens with the remembered picks', () => {
    mocks.stored = { model: 'opus', effort: 'max', switches: { skipPermissions: false } }
    renderBox()
    expect(screen.getByText('Opus')).toBeTruthy()
    expect(screen.getByText('Max')).toBeTruthy()
    fireEvent.click(screen.getByText('Start New'))
    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        launch: { sessionOptions: { model: 'opus', effort: 'max', permissionMode: 'own' } }
      })
    )
  })

  it('hides the resume list when this folder has no conversations', () => {
    renderBox()
    expect(screen.queryByText('Resume')).toBeNull()
  })

  it('resumes a listed conversation with the same picks', () => {
    mocks.stored = { model: null, effort: null, switches: { chrome: true } }
    mocks.sessions = [
      {
        id: 'row-1',
        sessionId: 'abc-123',
        title: 'Fix the login page',
        modifiedAt: new Date(Date.now() - 3 * 3_600_000).toISOString()
      } as AiVaultSession
    ]
    renderBox()
    expect(screen.getByText('Resume')).toBeTruthy()
    expect(screen.getByText('3h ago')).toBeTruthy()
    fireEvent.click(screen.getByText('Fix the login page'))
    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        launch: { agentArgs: '--dangerously-skip-permissions --chrome --resume abc-123' }
      })
    )
  })

  it('opens the session history panel from "Show all…"', () => {
    mocks.sessions = [
      {
        id: 'row-1',
        sessionId: 'a',
        title: 'One',
        modifiedAt: new Date().toISOString()
      } as AiVaultSession
    ]
    renderBox()
    fireEvent.click(screen.getByText('Show all…'))
    expect(mocks.state.setRightSidebarTab).toHaveBeenCalledWith('vault')
    expect(mocks.state.setRightSidebarOpen).toHaveBeenCalledWith(true)
    expect(mocks.start).not.toHaveBeenCalled()
  })
})
