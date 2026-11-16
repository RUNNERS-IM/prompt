// 맥 여러 대가 같이 쓰는 「공용 프롬프트」 목록. ~/git/claude-config/settings/prompts.json 을 main 이 읽어
// 오른쪽 「프롬프트」 칸에 보여 준다. 파일이 없는 맥(일반 사용자)은 빈 목록이고, 칸에서는 읽기만 한다.

export const PROMPT_SHARED_LIBRARY_READ_CHANNEL = 'prompt:sharedLibrary:read'
export const PROMPT_SHARED_LIBRARY_CHANGED_CHANNEL = 'prompt:sharedLibrary:changed'

/** 홈 폴더 아래 공용 목록 파일 자리. git 으로 맥마다 같은 내용이 퍼진다. */
export const PROMPT_SHARED_LIBRARY_RELATIVE_PATH = [
  'git',
  'claude-config',
  'settings',
  'prompts.json'
] as const

export type SharedPromptItem = {
  id: string
  title: string
  body: string
}

export type PromptSharedLibraryApi = {
  read: () => Promise<SharedPromptItem[]>
  /** 파일이 바뀌면 새 목록을 넘긴다. 돌려준 함수로 그만 듣는다. */
  onChanged: (listener: (items: SharedPromptItem[]) => void) => () => void
}

/** 파일 글을 목록으로 바꾼다. 모양이 틀리면 빈 목록, 틀린 줄과 같은 id 의 두 번째 줄은 뺀다. */
export function parseSharedPromptLibrary(text: string): SharedPromptItem[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return []
  }
  const list = (data as { promptLibrary?: unknown } | null)?.promptLibrary
  if (!Array.isArray(list)) {
    return []
  }
  const seen = new Set<string>()
  const items: SharedPromptItem[] = []
  for (const entry of list) {
    const { id, title, body } = (entry ?? {}) as Record<string, unknown>
    if (typeof id !== 'string' || typeof title !== 'string' || typeof body !== 'string') {
      continue
    }
    const trimmedId = id.trim()
    if (!trimmedId || !title.trim() || !body.trim() || seen.has(trimmedId)) {
      continue
    }
    seen.add(trimmedId)
    items.push({ id: trimmedId, title: title.trim(), body: body.trim() })
  }
  return items
}
