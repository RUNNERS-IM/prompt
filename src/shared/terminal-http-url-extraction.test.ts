import { describe, expect, it } from 'vitest'
import {
  extractTerminalHttpLinks,
  hasProseAfterHttpUrl,
  TERMINAL_HTTP_URL_REGEX
} from './terminal-http-url-extraction'

const urlsIn = (line: string): string[] => extractTerminalHttpLinks(line).map((link) => link.url)

describe('extractTerminalHttpLinks', () => {
  it('stops at a full-width parenthesis instead of swallowing the annotation', () => {
    expect(
      urlsIn('- PR: https://github.com/stablyai/orca/pull/12345（作成済み・マージ待ち）')
    ).toEqual(['https://github.com/stablyai/orca/pull/12345'])
  })

  it('stops at a full-width closing quote', () => {
    expect(urlsIn('詳細は「https://example.com/docs」を参照')).toEqual(['https://example.com/docs'])
  })

  it('stops at an ideographic space', () => {
    expect(urlsIn('PR: https://example.com/a　（全角スペース区切り）')).toEqual([
      'https://example.com/a'
    ])
  })

  it('keeps unencoded CJK letters that are genuinely part of the path', () => {
    // Why: wrapped URLs with Chinese path segments are supported; only punctuation ends a url.
    expect(urlsIn('https://example.com/文档/路径')).toEqual([
      new URL('https://example.com/文档/路径').toString()
    ])
  })

  it('stops at a full-width comma and full stop between a url and prose', () => {
    expect(urlsIn('https://example.com/a、次へ')).toEqual(['https://example.com/a'])
    expect(urlsIn('https://example.com/b。')).toEqual(['https://example.com/b'])
    expect(urlsIn('詳細はhttps://example.com/docs……')).toEqual(['https://example.com/docs'])
  })

  it.each([
    ['운영(https://ir.sense.im)에 반영했고', 'https://ir.sense.im'],
    ['운영 https://ir.sense.im에 반영했고', 'https://ir.sense.im'],
    ['주소는 https://ir.sense.im입니다.', 'https://ir.sense.im'],
    ['http://localhost:3000에서 확인', 'http://localhost:3000'],
    ['https://ir.sense.im(운영)에 반영', 'https://ir.sense.im'],
    ['https://example.com/docs(설명)을 보세요', 'https://example.com/docs'],
    ['https://en.wikipedia.org/wiki/Foo_(bar)', 'https://en.wikipedia.org/wiki/Foo_(bar)'],
    ['(https://en.wikipedia.org/wiki/Foo_(bar))에', 'https://en.wikipedia.org/wiki/Foo_(bar)'],
    ['https://example.com/a(v=1).aspx', 'https://example.com/a(v=1).aspx'],
    [
      'https://ko.wikipedia.org/wiki/서울_(동음이의)',
      'https://ko.wikipedia.org/wiki/서울_(동음이의)'
    ],
    ['https://example.com/문서/경로', 'https://example.com/문서/경로'],
    ['https://한글.kr/경로', 'https://한글.kr/경로'],
    ['https://abc한글.com', 'https://abc한글.com'],
    ['**https://example.com/a**', 'https://example.com/a']
  ])('finds the same url by hit testing and by the link regex in %s', (line, url) => {
    expect(line.match(TERMINAL_HTTP_URL_REGEX)?.[0]).toBe(url)
    expect(urlsIn(line)).toEqual([new URL(url).toString()])
  })

  it.each([
    'https://ir.sense.im)에',
    'https://ir.sense.im에',
    'https://example.com/login)에서',
    'https://en.wikipedia.org/wiki/Foo_(bar))에'
  ])('flags prose swallowed by an explicit link target: %s', (uri) => {
    expect(hasProseAfterHttpUrl(uri)).toBe(true)
  })

  it.each([
    'https://ir.sense.im',
    'https://en.wikipedia.org/wiki/Foo_(bar)',
    'https://example.com/문서/경로',
    'https://example.com/a!b*c?q="x"',
    'https://example.com/a)b/c',
    'file:///tmp/a)에',
    'mailto:a@b.c'
  ])('keeps a genuine explicit link target: %s', (uri) => {
    expect(hasProseAfterHttpUrl(uri)).toBe(false)
  })
})
