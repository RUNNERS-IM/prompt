import type { ActivityBarItem } from './activity-bar-buttons'

type RightSidebarActivityVisibilityState = {
  isFolder: boolean
  isFolderWorkspace: boolean
  /** The workspace runs on an SSH host, reached directly or through its managed server. */
  hasSshHost: boolean
  activeTab: ActivityBarItem['id']
}

export function getVisibleRightSidebarActivityItems(
  items: ActivityBarItem[],
  { isFolder, isFolderWorkspace, hasSshHost, activeTab }: RightSidebarActivityVisibilityState
): ActivityBarItem[] {
  return items.filter(
    (item) =>
      (!item.gitOnly || !isFolder) &&
      (!item.folderOnly || isFolderWorkspace) &&
      (!item.sshOnly || hasSshHost) &&
      (!item.onlyWhileActive || item.id === activeTab)
  )
}
