import { ipcMain } from 'electron'
import type { ClaudeAccountService } from '../claude-accounts/service'
import type { ClaudeAccountSelectionTarget } from '../claude-accounts/runtime-selection'
import { openAccountSignInLink } from './account-sign-in-link-opener'
import { listClaudeProfileHomesAsync } from '../claude-accounts/claude-profile-homes'
import { probeClaudeRunningSessions } from '../claude-accounts/claude-running-session-probe'
import { rememberClaudeRunningSessions } from '../claude-accounts/claude-running-session-cache'
import { getAppEnvironment } from '../../shared/app-environment'

export function registerClaudeAccountHandlers(claudeAccounts: ClaudeAccountService): void {
  claudeAccounts.setWslSignInLinkOpener((signInLink) => openAccountSignInLink('claude', signInLink))
  ipcMain.handle('claudeAccounts:list', () => claudeAccounts.listAccounts())
  ipcMain.handle('claudeAccounts:probeRunningSessions', async () => {
    const host = claudeAccounts.listAccounts()
    // Why every profile folder: a session can still run on an account removed from the list.
    const profileHomes = await listClaudeProfileHomesAsync(getAppEnvironment().getPath('userData'))
    const evidence = await probeClaudeRunningSessions([
      ...(host.systemDefaultHome ? [host.systemDefaultHome] : []),
      ...host.accounts.flatMap((account) => (account.home ? [account.home] : [])),
      ...profileHomes
    ])
    rememberClaudeRunningSessions(evidence)
    return evidence
  })
  ipcMain.handle(
    'claudeAccounts:add',
    (_event, args?: ClaudeAccountSelectionTarget & { copyLink?: boolean }) =>
      claudeAccounts.addAccount(args, args?.copyLink)
  )
  ipcMain.handle('claudeAccounts:cancelPendingLogin', () => claudeAccounts.cancelPendingLogin())
  ipcMain.handle(
    'claudeAccounts:reauthenticate',
    (_event, args: { accountId: string; copyLink?: boolean }) =>
      claudeAccounts.reauthenticateAccount(args.accountId, args.copyLink)
  )
  ipcMain.handle('claudeAccounts:waitForSignInLink', () => claudeAccounts.waitForSignInLink())
  ipcMain.handle('claudeAccounts:remove', (_event, args: { accountId: string }) =>
    claudeAccounts.removeAccount(args.accountId)
  )
  ipcMain.handle(
    'claudeAccounts:select',
    (_event, args: { accountId: string | null } & ClaudeAccountSelectionTarget) =>
      args.runtime
        ? claudeAccounts.selectAccountForTarget(args.accountId, args)
        : claudeAccounts.selectAccount(args.accountId)
  )
}
