import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'

const mocks = vi.hoisted(() => {
  const worktreesByRepo: Record<
    string,
    { id: string; hostId?: string; ephemeralVmCheckoutMode?: 'provisioned-root' }[]
  > = {}
  const tabsByWorktree: Record<string, { id: string }[]> = {}
  const ptyIdsByTabId: Record<string, string[]> = {}
  const runtimeEnvironments: { id: string; orcadDeployment?: { sshTargetId: string } }[] = []
  return {
    state: {
      activeModal: 'confirm-remove-folder' as string | null,
      modalData: {
        repoId: 'repo-1',
        displayName: 'Example',
        hostId: 'ssh:target-1'
      } as Record<string, unknown>,
      repos: [] as Repo[],
      runtimeEnvironments,
      sshTargetLabels: new Map<string, string>(),
      removedSshTargetLabels: new Map<string, string>(),
      worktreesByRepo,
      detectedWorktreesByRepo: {},
      tabsByWorktree,
      ptyIdsByTabId,
      closeModal: vi.fn(),
      removeProject: vi.fn()
    }
  }
})

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state)
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h1>{children}</h1>
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string>) =>
    Object.entries(values ?? {}).reduce(
      (text, [key, value]) => text.replace(`{{${key}}}`, value),
      fallback
    )
}))

import RemoveFolderDialog from './RemoveFolderDialog'

function repo(connectionId: string | null, executionHostId: Repo['executionHostId']): Repo {
  return {
    id: 'repo-1',
    path: '/workspace/example',
    displayName: 'Example',
    badgeColor: '#000',
    addedAt: 1,
    kind: 'git',
    connectionId,
    executionHostId
  }
}

describe('RemoveFolderDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.modalData = {
      repoId: 'repo-1',
      displayName: 'Example',
      hostId: 'ssh:target-1'
    }
    mocks.state.sshTargetLabels = new Map([['target-1', 'Persistent host']])
    mocks.state.removedSshTargetLabels = new Map()
    mocks.state.worktreesByRepo = {}
    mocks.state.tabsByWorktree = {}
    mocks.state.ptyIdsByTabId = {}
    mocks.state.runtimeEnvironments = []
  })

  it("warns about VM recipe cleanup for a project on a recipe VM's managed server", () => {
    mocks.state.modalData.hostId = 'runtime:env-vm'
    mocks.state.repos = [repo(null, 'runtime:env-vm')]
    mocks.state.runtimeEnvironments = [
      { id: 'env-vm', orcadDeployment: { sshTargetId: 'runtime-ssh-runtime-1' } }
    ]

    const html = renderToStaticMarkup(<RemoveFolderDialog />)

    expect(html).toContain('Its VM recipe determines whether the environment')
    expect(html).not.toContain('Its folder and files stay where they are')
  })

  it('warns that VM recipe cleanup controls file deletion', () => {
    mocks.state.modalData.hostId = 'ssh:runtime-ssh-runtime-1'
    mocks.state.repos = [repo('runtime-ssh-runtime-1', 'ssh:runtime-ssh-runtime-1')]

    const html = renderToStaticMarkup(<RemoveFolderDialog />)

    expect(html).toContain('Its VM recipe determines whether the environment')
    expect(html).toContain('files are permanently deleted')
    expect(html).not.toContain('Its folder and files stay on')
  })

  it('warns about VM recipe cleanup for an adopted provisioned root before the catalog loads', () => {
    mocks.state.modalData.hostId = 'runtime:env-vm'
    mocks.state.repos = [repo(null, 'runtime:env-vm')]
    mocks.state.worktreesByRepo = {
      'repo-1': [
        { id: 'repo-1::/vm', hostId: 'runtime:env-vm', ephemeralVmCheckoutMode: 'provisioned-root' }
      ]
    }

    expect(renderToStaticMarkup(<RemoveFolderDialog />)).toContain('Its VM recipe determines')
  })

  it('keeps the file-preservation promise for ordinary SSH projects', () => {
    mocks.state.repos = [repo('target-1', 'ssh:target-1')]

    const html = renderToStaticMarkup(<RemoveFolderDialog />)

    expect(html).toContain('Its folder and files stay on Persistent host')
    expect(html).not.toContain('VM recipe')
  })

  it('names the project and says the whole project goes, not one session', () => {
    mocks.state.repos = [repo('target-1', 'ssh:target-1')]

    const html = renderToStaticMarkup(<RemoveFolderDialog />)

    expect(html).toContain('Remove the &#x27;Example&#x27; project from the list?')
    expect(html).toContain('This removes the whole project, not just one session.')
    expect(html).toContain('To close just one session, use the × on its row.')
    expect(html).toContain('Remove Project')
    expect(html).not.toContain('Orca')
  })

  it('leaves out the running-session sentence when nothing is running', () => {
    mocks.state.repos = [repo('target-1', 'ssh:target-1')]

    expect(renderToStaticMarkup(<RemoveFolderDialog />)).not.toContain('running session')
  })

  it('says how many running sessions removal will stop', () => {
    mocks.state.repos = [repo('target-1', 'ssh:target-1')]
    mocks.state.worktreesByRepo = {
      'repo-1': [{ id: 'repo-1::/workspace/example', hostId: 'ssh:target-1' }]
    }
    mocks.state.tabsByWorktree = { 'repo-1::/workspace/example': [{ id: 'a' }, { id: 'b' }] }
    mocks.state.ptyIdsByTabId = { a: ['pty-a'], b: ['pty-b'] }

    expect(renderToStaticMarkup(<RemoveFolderDialog />)).toContain(
      'All 2 running sessions in it will be stopped.'
    )
  })
})
