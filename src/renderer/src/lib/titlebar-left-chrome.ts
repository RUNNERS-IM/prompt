export type LeftTitlebarChromeLayoutInput = {
  workspaceChromeActive: boolean
  stackedSidebarOpen: boolean
  creationLayoutActive: boolean
  sidebarOpen: boolean
  /** Arabic swaps the sidebars; the macOS traffic lights stay at the window's left edge. */
  workspaceMirrored?: boolean
}

export type LeftTitlebarChromeLayout = {
  shouldMount: boolean
  isFloating: boolean
}

export function resolveLeftTitlebarChromeLayout({
  workspaceChromeActive,
  stackedSidebarOpen,
  creationLayoutActive,
  sidebarOpen,
  workspaceMirrored = false
}: LeftTitlebarChromeLayoutInput): LeftTitlebarChromeLayout {
  const shouldMount = workspaceChromeActive || stackedSidebarOpen || creationLayoutActive
  return {
    shouldMount,
    // Mirrored, the sidebar column sits at the right, so the header always floats at the window's left.
    isFloating: shouldMount && (workspaceMirrored || (!sidebarOpen && !stackedSidebarOpen))
  }
}
