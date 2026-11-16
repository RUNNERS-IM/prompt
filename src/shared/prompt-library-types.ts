export type PromptLibraryItem = {
  id: string
  title: string
  body: string
  updatedAt: number
  /** 'auto' = 자주 친 글이라 Prompt 가 넣은 줄. 사용자가 고치면 빠지고 「내 것」이 된다. */
  source?: 'auto'
  /** 자동으로 넣을 때 쓴 같은-글 열쇠. 고친 뒤에도 남겨 같은 글을 다시 넣지 않는다. */
  autoKey?: string
}

/** 이 맥에서 친 글을 같은-글 열쇠별로 센 기록. 다른 맥 · 서버로 보내지 않는다. */
export type PromptLibraryUsageEntry = {
  /** 가장 많이 친 원래 글. 자동으로 넣을 때 이 글을 쓴다. */
  text: string
  count: number
  lastAt: number
  /** 같은 열쇠로 묶인 원래 글별 횟수(많은 것 몇 개만). */
  variants: Record<string, number>
  /** 최근에 센 차례(창 · 다시 연결로 같은 차례를 두 번 세지 않게). */
  turns: string[]
}

export type FileExplorerViewMode = 'grid' | 'list'

export type PromptLibrarySettings = {
  promptLibrary: PromptLibraryItem[]
  fileExplorerViewMode: FileExplorerViewMode
  /** 처음 켤 때 기본 프롬프트를 한 번 넣었는지. */
  promptLibrarySeeded?: boolean
  promptLibraryUsage?: Record<string, PromptLibraryUsageEntry>
  /** 사용자가 지운 자동 줄의 열쇠. 다시 넣지 않는다. */
  promptLibraryDismissedAuto?: string[]
}
