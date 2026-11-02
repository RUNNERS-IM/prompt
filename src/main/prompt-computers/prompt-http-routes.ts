import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Prompt: extra plain-HTTP routes on the runtime's WebSocket port, checked before the static
 * web client. A route returns true when it answered the request.
 * Kept in a Prompt-only file so the daily upstream merge does not conflict.
 */
export type PromptHttpRoute = (req: IncomingMessage, res: ServerResponse) => boolean

let routes: readonly PromptHttpRoute[] = []

export function setPromptHttpRoutes(next: readonly PromptHttpRoute[]): void {
  routes = next
}

export function handlePromptHttpRoute(req: IncomingMessage, res: ServerResponse): boolean {
  return routes.some((route) => route(req, res))
}
