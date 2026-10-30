import { homedir } from 'node:os'
import { readFileSync } from 'node:fs'
import {
  findTransport,
  getRuntimeMetadataPath,
  type RuntimeMetadata
} from '../../shared/runtime-bootstrap'
import { RuntimeClientError } from './types'
import {
  redirectLegacyUserDataPath,
  resolveDefaultPromptUserDataPath
} from '../../shared/prompt-user-data-location'

export function readMetadata(userDataPath: string): RuntimeMetadata {
  const metadataPath = getRuntimeMetadataPath(userDataPath)
  try {
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as RuntimeMetadata | null
    if (!metadata || !findTransport(metadata, 'unix', 'named-pipe') || !metadata.authToken) {
      throw new RuntimeClientError(
        'runtime_unavailable',
        `Orca runtime metadata is incomplete at ${metadataPath}`
      )
    }
    return metadata
  } catch (error) {
    if (error instanceof RuntimeClientError) {
      throw error
    }
    throw new RuntimeClientError(
      'runtime_unavailable',
      `Could not read Orca runtime metadata at ${metadataPath}. Start the Orca app first.`
    )
  }
}

export function tryReadMetadata(userDataPath: string): RuntimeMetadata | null {
  const metadataPath = getRuntimeMetadataPath(userDataPath)
  try {
    return JSON.parse(readFileSync(metadataPath, 'utf8')) as RuntimeMetadata | null
  } catch {
    return null
  }
}

export function getDefaultUserDataPath(
  platform: NodeJS.Platform = process.platform,
  homeDir = homedir()
): string {
  if (process.env.ORCA_USER_DATA_PATH) {
    // Terminals opened before Prompt moved its data folder still export the old one.
    return redirectLegacyUserDataPath(process.env.ORCA_USER_DATA_PATH, platform, homeDir)
  }
  return getPlatformUserDataPath(platform, homeDir)
}

/** The packaged app's own default profile, ignoring any CLI override. */
export function getPlatformUserDataPath(
  platform: NodeJS.Platform = process.platform,
  homeDir = homedir()
): string {
  // Match the packaged app: its Prompt folder once ready, the inherited orca folder until then.
  const userDataPath = resolveDefaultPromptUserDataPath(platform, homeDir)
  if (!userDataPath) {
    throw new RuntimeClientError(
      'runtime_unavailable',
      'APPDATA is not set, so the Orca runtime metadata path cannot be resolved.'
    )
  }
  return userDataPath
}
