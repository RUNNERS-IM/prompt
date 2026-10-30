import { AGENT_MODEL_MAX_LENGTH } from './agent-status-field-normalization'

export type ClaudeStatusLineModel = {
  paneKey: string
  /** Human label from Claude's statusline (`model.display_name`), falling back to `model.id`. */
  model: string
}

function singleLine(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function readField(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  return new Map<string, unknown>(Object.entries(value)).get(key)
}

/** Parse the pane's current model from managed statusline form data; null when absent. */
export function parseClaudeStatusLineModel(body: unknown): ClaudeStatusLineModel | null {
  const paneKey = singleLine(readField(body, 'paneKey'))
  const rawPayload = readField(body, 'payload')
  if (!paneKey || typeof rawPayload !== 'string' || !rawPayload) {
    return null
  }
  let payload: unknown
  try {
    payload = JSON.parse(rawPayload)
  } catch {
    return null
  }
  const rawModel = readField(payload, 'model')
  const model = (
    singleLine(readField(rawModel, 'display_name')) || singleLine(readField(rawModel, 'id'))
  ).slice(0, AGENT_MODEL_MAX_LENGTH)
  return model ? { paneKey, model } : null
}

/** Claude hooks never carry the model, so keep the statusline-reported one across hook updates. */
export function preserveClaudeStatusLineModel<
  T extends { payload: { agentType?: string; model?: string } }
>(previous: T | undefined, incoming: T, sameOwner: boolean): T {
  if (
    !sameOwner ||
    incoming.payload.model ||
    incoming.payload.agentType !== 'claude' ||
    previous?.payload.agentType !== 'claude' ||
    !previous.payload.model
  ) {
    return incoming
  }
  return { ...incoming, payload: { ...incoming.payload, model: previous.payload.model } }
}
