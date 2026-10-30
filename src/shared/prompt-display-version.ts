// Prompt release versions are 2.6.MMDDNN (2.6.103002 = Oct 30, second build). Screens show 2.6.1030.2 instead;
// the app, updater and comparisons keep the real semver.
const RELEASE_VERSION = /^(\d+)\.(\d+)\.(\d{1,2})(\d{2})(\d{2})$/

/** The version as people should read it; versions not in the MMDDNN form are returned unchanged. */
export function formatPromptDisplayVersion(version: string): string {
  const match = RELEASE_VERSION.exec(version)
  if (!match) {
    return version
  }
  const [, major, minor, month, day, build] = match
  const monthNumber = Number(month)
  const dayNumber = Number(day)
  const buildNumber = Number(build)
  if (
    month.startsWith('0') ||
    monthNumber < 1 ||
    monthNumber > 12 ||
    dayNumber < 1 ||
    dayNumber > 31 ||
    buildNumber < 1
  ) {
    return version
  }
  const base = `${major}.${minor}.${month}${day}`
  return buildNumber === 1 ? base : `${base}.${buildNumber}`
}
