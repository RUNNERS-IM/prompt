import React, { useEffect, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { FileTypeIcon, FolderIcon } from '@/components/FileTypeIcon'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { dirname } from '@/lib/path'
import { useAppStore } from '@/store'
import { activateFileExplorerNode } from './useFileExplorerHandlers'
import type { useFileExplorerTree } from './useFileExplorerTree'
import type { TreeNode } from './file-explorer-types'

export function FileExplorerGridPane({
  rootPath,
  worktreeId,
  runtimeEnvironmentId,
  showDotfiles,
  tree
}: {
  rootPath: string
  worktreeId: string
  runtimeEnvironmentId: string | null | undefined
  showDotfiles: boolean
  tree: ReturnType<typeof useFileExplorerTree>
}): React.JSX.Element {
  const openFile = useAppStore((s) => s.openFile)
  const [currentDir, setCurrentDir] = useState(rootPath)
  const [loadedDepth, setLoadedDepth] = useState(-1)
  const { loadDir } = tree

  useEffect(() => {
    setCurrentDir(rootPath)
    setLoadedDepth(-1)
  }, [rootPath])
  useEffect(() => {
    void loadDir(currentDir, loadedDepth)
  }, [currentDir, loadDir, loadedDepth])

  const entries = (tree.dirCache[currentDir]?.children ?? []).filter(
    (node) => showDotfiles || !node.name.startsWith('.')
  )
  const atRoot = currentDir === rootPath
  const activate = (node: TreeNode): void => {
    void activateFileExplorerNode({
      node,
      activeWorktreeId: worktreeId,
      runtimeEnvironmentId,
      openFile,
      toggleDir: (_worktreeId, dirPath) => {
        setLoadedDepth(node.depth)
        setCurrentDir(dirPath)
      },
      loadDir,
      statPath: tree.statPath,
      markPathAsDirectory: tree.markPathAsDirectory,
      setSelectedPath: () => {}
    })
  }

  return (
    <div className="absolute inset-0 flex min-h-0 flex-col bg-sidebar">
      {atRoot ? null : (
        <div className="flex h-7 shrink-0 items-center gap-1 border-b border-border/60 px-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={translate('prompt.library.upFolder', 'Up one folder')}
            onClick={() => {
              setLoadedDepth((depth) => depth - 1)
              setCurrentDir(dirname(currentDir))
            }}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
            {currentDir.slice(rootPath.length + 1)}
          </span>
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(82px,1fr))] content-start gap-1 overflow-auto p-2">
        {entries.map((node) => (
          <button
            key={node.path}
            type="button"
            title={node.name}
            className="flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 hover:bg-accent/60"
            onClick={() => activate(node)}
          >
            {node.isDirectory ? (
              <FolderIcon
                open={false}
                className="size-11 fill-sky-400/25 text-sky-400"
                style={{ strokeWidth: 1 }}
              />
            ) : (
              <FileTypeIcon
                filePath={node.name}
                className="size-11 text-muted-foreground"
                style={{ strokeWidth: 1 }}
              />
            )}
            <span className="line-clamp-2 w-full text-center text-[11px] leading-[14px] break-all text-foreground/90">
              {node.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
