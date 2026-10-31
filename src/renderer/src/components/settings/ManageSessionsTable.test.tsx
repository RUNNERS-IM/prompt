import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { PtyManagementSession } from '../../../../preload/api-types'
import { TooltipProvider } from '../ui/tooltip'
import { ManageSessionsTable } from './ManageSessionsTable'

function session(sessionId: string, previousVersionUnattached?: boolean): PtyManagementSession {
  return {
    sessionId,
    state: 'running',
    shellState: 'ready',
    isAlive: true,
    pid: 1,
    cwd: null,
    cols: 80,
    rows: 24,
    createdAt: 0,
    protocolVersion: 7,
    ...(previousVersionUnattached ? { previousVersionUnattached } : {})
  }
}

function render(sessions: PtyManagementSession[], ptyIdToTabId = new Map<string, string>()) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <ManageSessionsTable
        sessions={sessions}
        hasLoadedOnce
        sessionCount={sessions.length}
        isBusy={false}
        isRefreshing={false}
        daemonBusyKind={null}
        ptyIdToTabId={ptyIdToTabId}
        onRefresh={vi.fn()}
        onKillAll={vi.fn()}
        onRestartDaemon={vi.fn()}
        onNavigate={vi.fn()}
        onRequestKill={vi.fn()}
      />
    </TooltipProvider>
  )
}

const LABEL = 'Previous version · not in a tab yet'

describe('ManageSessionsTable previous-version label', () => {
  it('labels a previous-version session no tab has attached to', () => {
    expect(render([session('wt::/old@@1', true)])).toContain(LABEL)
  })

  it('drops the label once a tab in this window shows the session', () => {
    expect(
      render([session('wt::/old@@1', true)], new Map([['wt::/old@@1', 'tab-1']]))
    ).not.toContain(LABEL)
  })

  it('never labels ordinary sessions', () => {
    expect(render([session('wt::/new@@1')])).not.toContain(LABEL)
  })
})
