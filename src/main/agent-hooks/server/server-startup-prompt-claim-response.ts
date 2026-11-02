import type { ServerResponse } from 'node:http'

export function respondToStartupPromptClaim(
  res: ServerResponse,
  claimStartupPrompt: () => boolean | 'pending' | undefined
): void {
  res.writeHead(200, { 'content-type': 'application/json' })
  const claim = claimStartupPrompt()
  res.end(
    JSON.stringify({
      allowed: claim === true,
      ...(claim === 'pending' ? { pending: true } : {})
    })
  )
}

/** A truncated claim body asks the plugin to retry (503); any other failure denies the claim. */
export function respondToFailedStartupPromptClaim(res: ServerResponse, retryable: boolean): void {
  if (retryable) {
    res.writeHead(503)
    res.end()
    return
  }
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end('{"allowed":false}')
}
