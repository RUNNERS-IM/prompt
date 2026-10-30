import { describe, expect, it } from 'vitest'
import { formatNotices } from './prompt-notices-format'

describe('formatNotices', () => {
  it('shows "#" lines as headings and drops code fences and inline marks', () => {
    expect(
      formatNotices(
        '# Third-party notices\n\n## Orca\n\nSee <https://x.dev> and `a/b`.\n\n```text\nMIT License\n```\n'
      )
    ).toEqual([
      { kind: 'heading', text: 'Third-party notices' },
      { kind: 'heading', text: 'Orca' },
      { kind: 'paragraph', lines: ['See https://x.dev and a/b.'] },
      { kind: 'paragraph', lines: ['MIT License'] }
    ])
  })

  it('joins text wrapped at 80 columns into one paragraph line', () => {
    expect(
      formatNotices(
        'Permission is hereby granted, free of charge, to any person obtaining a copy\nof this software.\n'
      )
    ).toEqual([
      {
        kind: 'paragraph',
        lines: [
          'Permission is hereby granted, free of charge, to any person obtaining a copy of this software.'
        ]
      }
    ])
  })

  it('joins wrapped lines that merely start with the word Copyright', () => {
    expect(
      formatNotices(
        '3) No Modified Version may use the Reserved Font\nCopyright Holder. This applies\nCOPYRIGHT HOLDER BE LIABLE.\n'
      )
    ).toEqual([
      {
        kind: 'paragraph',
        lines: [
          '3) No Modified Version may use the Reserved Font Copyright Holder. This applies COPYRIGHT HOLDER BE LIABLE.'
        ]
      }
    ])
  })

  it('keeps copyright lines, dividers and section labels on their own lines', () => {
    expect(
      formatNotices(
        'Copyright (c) Electron contributors\nCopyright (c) 2013-2020 GitHub Inc.\n\n-----\nSIL OPEN FONT LICENSE Version 1.1\n-----\n\nPREAMBLE\nThe goals of the\nOpen Font License.\n\nTHE SOFTWARE IS PROVIDED "AS IS",\nWITHOUT WARRANTY. IN NO EVENT\nSOFTWARE.\n'
      )
    ).toEqual([
      {
        kind: 'paragraph',
        lines: ['Copyright (c) Electron contributors', 'Copyright (c) 2013-2020 GitHub Inc.']
      },
      { kind: 'paragraph', lines: ['-----', 'SIL OPEN FONT LICENSE Version 1.1', '-----'] },
      { kind: 'paragraph', lines: ['PREAMBLE', 'The goals of the Open Font License.'] },
      {
        kind: 'paragraph',
        lines: ['THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY. IN NO EVENT SOFTWARE.']
      }
    ])
  })
})
