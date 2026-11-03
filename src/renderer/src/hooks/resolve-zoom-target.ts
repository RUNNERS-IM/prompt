function closestFocusedElement(element: unknown, selector: string): unknown {
  if (
    typeof element === 'object' &&
    element !== null &&
    'closest' in element &&
    typeof element.closest === 'function'
  ) {
    return element.closest(selector)
  }
  return null
}

const BROWSER_PAGE_ID_ATTRIBUTES = [
  'data-browser-page-pane-id',
  'data-browser-page-viewport-id',
  'data-browser-page-menu-id'
]

/** Resolve browser page focus from page, address bar/toolbar or external menu, which may live outside the pane. */
export function focusedBrowserPageId(activeElement: unknown): string | null {
  for (const attribute of BROWSER_PAGE_ID_ATTRIBUTES) {
    const owner = closestFocusedElement(activeElement, `[${attribute}]`)
    if (
      typeof owner === 'object' &&
      owner !== null &&
      'getAttribute' in owner &&
      typeof owner.getAttribute === 'function'
    ) {
      const browserPageId: unknown = owner.getAttribute(attribute)
      return typeof browserPageId === 'string' ? browserPageId : null
    }
  }
  return null
}
