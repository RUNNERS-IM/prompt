import { defineMethod } from '../core'
import { RepoPath, RepoRelocate } from '../../../../shared/rpc-contract/repo-params'
import { projectRepoVisibilityForClient } from '../repo-visibility-projection'

export const REPO_REGISTRATION_METHODS = [
  defineMethod({
    name: 'repo.add',
    permission: 'workspace',
    params: RepoPath,
    handler: async (params, context) => {
      const outcome = await context.runtime.addRepoWithOutcome(
        params.path,
        params.kind,
        undefined,
        params.displayName
      )
      return {
        repo: projectRepoVisibilityForClient(outcome.repo, context),
        // Optional so older clients keep reading only `repo`.
        ...(outcome.existingPath
          ? {
              alreadyRegistered: {
                path: outcome.existingPath,
                requestedPath: outcome.requestedPath
              }
            }
          : {})
      }
    }
  }),
  defineMethod({
    name: 'repo.relocate',
    permission: 'workspace',
    params: RepoRelocate,
    handler: async (params, context) => {
      const result = await context.runtime.relocateRepo(params.repo, params.path)
      return { ...result, repo: projectRepoVisibilityForClient(result.repo, context) }
    }
  })
]
