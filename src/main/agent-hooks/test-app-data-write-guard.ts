import { realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { PROMPT_TEST_APP_DATA_DIR_ENV } from '../../shared/prompt-user-data-location'

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function realpathOrSelf(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/**
 * A test instance shares the person's home with the running app, so its hook reconciliation
 * would rewrite ~/.claude/settings.json and friends for every live session. Inside a test
 * app-data root, only files under that root may be written.
 */
export function isBlockedByTestAppData(
  targetPath: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const override = env[PROMPT_TEST_APP_DATA_DIR_ENV]?.trim()
  if (!override) {
    return false
  }
  const target = resolve(targetPath)
  const roots = [resolve(override), realpathOrSelf(resolve(override))]
  return !roots.some((root) => isInside(root, target) || isInside(root, realpathOrSelf(target)))
}

export function skipWriteOutsideTestAppData(targetPath: string): boolean {
  if (!isBlockedByTestAppData(targetPath)) {
    return false
  }
  console.warn(`[agent-hooks] Test app data in use; left ${targetPath} unchanged`)
  return true
}
