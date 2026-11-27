import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'
import type { AgentResumeDiagnostic } from '../../shared/agent-resume-diagnostics'

export const diagnosticsApi = {
  getStatus: () => ipcRenderer.invoke('diagnostics:getStatus'),
  collectBundle: (lookbackMinutes?: number) =>
    ipcRenderer.invoke('diagnostics:collectBundle', lookbackMinutes),
  openBundlePreview: (bundleSubmissionId: string): Promise<void> =>
    ipcRenderer.invoke('diagnostics:openBundlePreview', bundleSubmissionId),
  discardBundlePreview: (bundleSubmissionId: string): Promise<void> =>
    ipcRenderer.invoke('diagnostics:discardBundlePreview', bundleSubmissionId),
  uploadBundle: (bundleSubmissionId: string) =>
    ipcRenderer.invoke('diagnostics:uploadBundle', bundleSubmissionId),
  deleteBundle: (ticketId: string): Promise<void> =>
    ipcRenderer.invoke('diagnostics:deleteBundle', ticketId),
  recordAgentResume: (diagnostic: AgentResumeDiagnostic): Promise<void> =>
    ipcRenderer.invoke('diagnostics:recordAgentResume', diagnostic)
} satisfies PreloadApi['diagnostics']
