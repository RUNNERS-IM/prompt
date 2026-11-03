import { describe, expect, it } from 'vitest'
import { relocatedPath } from './repo-path-relocation'

describe('relocatedPath', () => {
  it('swaps the root and keeps the rest of a nested path', () => {
    expect(relocatedPath('/Desktop/git/app', '/Desktop/git/app', '/git/app')).toBe('/git/app')
    expect(relocatedPath('/Desktop/git/app/.wt/a', '/Desktop/git/app', '/git/app')).toBe(
      '/git/app/.wt/a'
    )
    expect(relocatedPath('C:\\src\\app\\wt', 'C:\\src\\app', 'D:\\app')).toBe('D:\\app\\wt')
  })

  it('leaves sibling and unrelated paths alone', () => {
    expect(relocatedPath('/Desktop/git/app-copy', '/Desktop/git/app', '/git/app')).toBe(
      '/Desktop/git/app-copy'
    )
    expect(relocatedPath('/elsewhere/wt', '/Desktop/git/app', '/git/app')).toBe('/elsewhere/wt')
  })
})
