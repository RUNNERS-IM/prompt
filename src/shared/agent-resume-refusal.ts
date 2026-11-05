/** Why a host started a plain shell instead of the asked-for resume. */
export type AgentResumeRefusal = 'chat-home' | 'chat-writing' | 'unverifiable' | 'running-elsewhere'

/** The live terminal already writing a refused conversation; paneKey is null outside Prompt panes. */
export type RunningElsewhereHolder = { paneKey: string | null; name: string | null }
