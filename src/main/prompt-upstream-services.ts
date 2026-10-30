// Prompt: switches that keep the fork from talking to Orca's company services.
// Unit tests run with the upstream behavior so upstream tests keep passing through daily merges.
export const PROMPT_BLOCK_UPSTREAM_SERVICES = process.env.VITEST !== 'true'
