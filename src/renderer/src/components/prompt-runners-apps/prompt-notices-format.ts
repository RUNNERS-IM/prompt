// Turns THIRD_PARTY_NOTICES.md into what the notices window shows, the way Split's notices sheet
// does: "#" lines become headings without the marks, code fences disappear, and license text
// that the source wraps at about 80 columns is joined back into paragraphs. Copyright lines,
// divider lines and capitalised section labels (PREAMBLE, DEFINITIONS) keep their own line.

export type NoticeBlock = { kind: 'heading'; text: string } | { kind: 'paragraph'; lines: string[] }

const HEADING = /^#+\s+(.*)$/
const FENCE = /^\s*```/
// A notice line ("Copyright (c) 2026 …", "Copyright 2014 …"), not prose that starts with
// "Copyright Holder" or the capitalised "COPYRIGHT HOLDER" of a warranty clause.
const COPYRIGHT_LINE = /^\s*(?:Copyright\s+(?:\(c\)|\(C\)|©|\d{4})|©)/
const DIVIDER_LINE = /^\s*[-=_*]{3,}\s*$/
const SECTION_LABEL = /^[A-Z][A-Z ]*[A-Z]$/

function plainInline(line: string): string {
  return line
    .replace(/`([^`]*)`/g, '$1')
    .replace(/<(https?:\/\/[^>\s]+)>/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)')
    .trim()
}

function keepsOwnLine(line: string, index: number, count: number): boolean {
  if (COPYRIGHT_LINE.test(line) || DIVIDER_LINE.test(line)) {
    return true
  }
  // A short all-caps first line over more text is a section label, not wrapped prose.
  return index === 0 && count > 1 && line.length <= 40 && SECTION_LABEL.test(line)
}

function joinWrappedLines(raw: string[]): string[] {
  const lines: string[] = []
  let current = ''
  raw.forEach((line, index) => {
    if (keepsOwnLine(line, index, raw.length)) {
      if (current) {
        lines.push(current)
        current = ''
      }
      lines.push(line)
      return
    }
    current = current ? `${current} ${line}` : line
  })
  if (current) {
    lines.push(current)
  }
  return lines
}

export function formatNotices(markdown: string): NoticeBlock[] {
  const blocks: NoticeBlock[] = []
  let pending: string[] = []
  const flush = (): void => {
    if (pending.length > 0) {
      blocks.push({ kind: 'paragraph', lines: joinWrappedLines(pending) })
      pending = []
    }
  }
  for (const rawLine of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (FENCE.test(rawLine)) {
      continue
    }
    const heading = HEADING.exec(rawLine)
    if (heading) {
      flush()
      blocks.push({ kind: 'heading', text: plainInline(heading[1]) })
      continue
    }
    const line = plainInline(rawLine)
    if (!line) {
      flush()
      continue
    }
    pending.push(line)
  }
  flush()
  return blocks
}
