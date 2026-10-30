// Prompt: the upstream updater tests run against Orca's repository (see shared/prompt-upstream).
// These cases run the same feed code the way a real Prompt build does: RUNNERS-IM/prompt releases
// tagged v2.{last digit of year}.{MMDD}{NN} by config/scripts/prompt-bump-release.sh.
import type * as PromptUpstream from '../shared/prompt-upstream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installNetRequestFetchAdapter } from './updater-net-request.fixture'

const ORIGINAL_PLATFORM = process.platform
const ORIGINAL_ARCH = process.arch
const RELEASES = 'https://github.com/RUNNERS-IM/prompt/releases'

const { netFetchMock, netRequestMock } = vi.hoisted(() => ({
  netFetchMock: vi.fn(),
  netRequestMock: vi.fn()
}))

vi.mock('electron', () => ({
  net: { fetch: netFetchMock, request: netRequestMock }
}))

// What every packaged build sees: the switch is only off while Vitest runs.
vi.mock('../shared/prompt-upstream', async (importOriginal) => ({
  ...(await importOriginal<typeof PromptUpstream>()),
  PROMPT_BLOCK_UPSTREAM_SERVICES: true,
  promptOr: <T>(promptValue: T): T => promptValue
}))

function atomFeed(tags: string[]): string {
  const entries = tags
    .map(
      (tag) =>
        `<entry><link rel="alternate" type="text/html" href="${RELEASES}/tag/${tag}"/><title>Prompt ${tag}</title></entry>`
    )
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><feed>${entries}</feed>`
}

function macManifest(tag: string): string {
  return [
    `version: ${tag.replace(/^v/, '')}`,
    'files:',
    '  - url: prompt-macos-arm64.zip',
    '    sha512: test',
    'path: prompt-macos-arm64.zip'
  ].join('\n')
}

function servePromptReleases(tags: string[], latestLocation?: string): void {
  netFetchMock.mockImplementation(async (url: string, init?: { method?: string }) => {
    if (url === `${RELEASES}.atom`) {
      return new Response(atomFeed(tags))
    }
    if (url === `${RELEASES}/latest`) {
      return new Response(null, { status: 302, headers: { location: latestLocation ?? '' } })
    }
    const download = url.match(
      /^https:\/\/github\.com\/RUNNERS-IM\/prompt\/releases\/download\/([^/]+)\/(.+)$/
    )
    if (!download || !tags.includes(decodeURIComponent(download[1]))) {
      return new Response(null, { status: 404 })
    }
    if (download[2] === 'latest-mac.yml') {
      return new Response(macManifest(decodeURIComponent(download[1])))
    }
    return new Response(null, { status: init?.method === 'HEAD' ? 200 : 404 })
  })
}

describe('Prompt release feed', () => {
  beforeEach(() => {
    vi.resetModules()
    netFetchMock.mockReset()
    netRequestMock.mockReset()
    installNetRequestFetchAdapter(netRequestMock, netFetchMock)
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    Object.defineProperty(process, 'arch', { value: 'arm64' })
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: ORIGINAL_PLATFORM })
    Object.defineProperty(process, 'arch', { value: ORIGINAL_ARCH })
  })

  it('reads the RUNNERS-IM/prompt release feed and download URLs', async () => {
    const { getReleaseDownloadUrl } = await import('./updater-prerelease-feed')
    expect(getReleaseDownloadUrl('v2.6.103001')).toBe(`${RELEASES}/download/v2.6.103001`)
  })

  it.each([
    { current: '2.6.103001', tags: ['v2.6.103002', 'v2.6.103001'], expected: 'v2.6.103002' },
    { current: '2.6.103002', tags: ['v2.6.110101', 'v2.6.103002'], expected: 'v2.6.110101' },
    { current: '2.6.123102', tags: ['v2.7.10501', 'v2.6.123102'], expected: 'v2.7.10501' },
    { current: '2.6.1030', tags: ['v2.6.103001'], expected: 'v2.6.103001' },
    { current: '1.4.214', tags: ['v2.6.103001'], expected: 'v2.6.103001' }
  ])('offers $expected to a build on $current', async ({ current, tags, expected }) => {
    servePromptReleases(tags)
    const { fetchNewerReleaseTagsWithReadiness } = await import('./updater-prerelease-feed')
    await expect(
      fetchNewerReleaseTagsWithReadiness(current, 1, { includePrerelease: false })
    ).resolves.toEqual({ tags: [expected], state: 'ready' })
    expect(netFetchMock).toHaveBeenCalledWith(
      `${RELEASES}/download/${expected}/prompt-macos-arm64.zip`,
      expect.objectContaining({ method: 'HEAD' })
    )
  })

  it('reports no newer release to the newest build', async () => {
    servePromptReleases(['v2.6.103002', 'v2.6.103001'])
    const { fetchNewerReleaseTagsWithReadiness } = await import('./updater-prerelease-feed')
    await expect(
      fetchNewerReleaseTagsWithReadiness('2.6.103002', 1, { includePrerelease: false })
    ).resolves.toEqual({ tags: [], state: 'no-newer' })
  })

  it('resolves the latest stable Prompt release from its redirect', async () => {
    servePromptReleases(['v2.6.103001'], `${RELEASES}/tag/v2.6.103001`)
    const { fetchLatestStableReleaseTag } = await import('./updater-prerelease-feed')
    await expect(fetchLatestStableReleaseTag()).resolves.toBe('v2.6.103001')
  })

  it('never resolves a release of another repository', async () => {
    servePromptReleases(
      ['v2.6.103001'],
      'https://github.com/stablyai/orca/releases/tag/v2.6.103001'
    )
    const { fetchLatestStableReleaseTag } = await import('./updater-prerelease-feed')
    await expect(fetchLatestStableReleaseTag()).resolves.toBeNull()
  })
})
