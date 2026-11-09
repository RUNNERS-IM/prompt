export type PromptLibraryItem = {
  id: string
  title: string
  body: string
  updatedAt: number
}

export type FileExplorerViewMode = 'grid' | 'list'

export type PromptLibrarySettings = {
  promptLibrary: PromptLibraryItem[]
  fileExplorerViewMode: FileExplorerViewMode
}
