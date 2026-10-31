import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetTracerForTests, setActiveSink, type TracerSink } from '../observability/tracer'
import {
  PreviousFolderSessionTrace,
  previousFolderSessionTraceKey,
  type PreviousFolderSessionOwner
} from './previous-folder-session-trace'

type Span = { name: string; attributes: Record<string, unknown> }

const previous: PreviousFolderSessionOwner = { fromPreviousDataFolder: true, protocolVersion: 7 }
const own: PreviousFolderSessionOwner = { fromPreviousDataFolder: false, protocolVersion: 7 }

let spans: Span[]

beforeEach(() => {
  spans = []
  const sink: TracerSink = {
    push(record) {
      spans.push(record as Span)
    },
    flush() {},
    close() {}
  }
  setActiveSink(sink)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  _resetTracerForTests()
})

function named(name: string): Span[] {
  return spans.filter((span) => span.name === name)
}

describe('previous-folder session trace', () => {
  it('lists the previous-folder sessions per daemon and never their raw ids', () => {
    const trace = new PreviousFolderSessionTrace(1_000)
    trace.recordDiscovered(
      new Map<string, PreviousFolderSessionOwner>([
        ['wt::/a@@1', previous],
        ['wt::/b@@2', previous],
        ['wt::/c@@3', own],
        ['wt::/d@@4', { fromPreviousDataFolder: true, protocolVersion: 6 }]
      ])
    )

    const listed = named('daemon.previous-folder.sessions')
    expect(listed).toHaveLength(2)
    const v7 = listed.find((span) => span.attributes['daemon.protocol_version'] === 7)!
    expect(v7.attributes['sessions.count']).toBe(2)
    expect(v7.attributes['sessions.keys']).toBe(
      [previousFolderSessionTraceKey('wt::/a@@1'), previousFolderSessionTraceKey('wt::/b@@2')]
        .sort()
        .join(',')
    )
    expect(JSON.stringify(spans)).not.toContain('/a@@1')
    expect(trace.discoveredSessionIds().sort()).toEqual(['wt::/a@@1', 'wt::/b@@2', 'wt::/d@@4'])
  })

  it('records one attach per previous-folder session and ignores Prompt’s own daemon', () => {
    const trace = new PreviousFolderSessionTrace(1_000)
    trace.recordDiscovered(new Map([['wt::/a@@1', previous]]))

    const routes = new Map([
      ['wt::/a@@1', previous],
      ['wt::/x@@9', own]
    ])
    trace.noteAttach(routes, 'wt::/a@@1', 'spawn')
    trace.noteAttach(routes, 'wt::/a@@1', 'attach')
    trace.noteAttach(routes, 'wt::/x@@9', 'spawn')
    trace.noteAttach(routes, 'wt::/y@@9', 'attach-only')

    const attaches = named('daemon.previous-folder.attach')
    expect(attaches).toHaveLength(1)
    expect(attaches[0].attributes).toMatchObject({
      'attach.via': 'spawn',
      'session.key': previousFolderSessionTraceKey('wt::/a@@1')
    })
    expect(trace.isAttached('wt::/a@@1')).toBe(true)
  })

  it('reports found minus attached once after the delay and again at quit', () => {
    const trace = new PreviousFolderSessionTrace(1_000)
    trace.recordDiscovered(
      new Map([
        ['wt::/a@@1', previous],
        ['wt::/b@@2', previous]
      ])
    )
    trace.noteAttach(new Map([['wt::/a@@1', previous]]), 'wt::/a@@1', 'spawn')

    expect(named('daemon.previous-folder.unattached')).toHaveLength(0)
    vi.advanceTimersByTime(1_000)
    // A second discovery (daemon restart) must not arm another delayed report.
    trace.recordDiscovered(
      new Map([
        ['wt::/a@@1', previous],
        ['wt::/b@@2', previous]
      ])
    )
    vi.advanceTimersByTime(5_000)
    trace.reportUnattached('quit')

    const reports = named('daemon.previous-folder.unattached')
    expect(reports.map((span) => span.attributes['report.reason'])).toEqual([
      'startup-delay',
      'quit'
    ])
    expect(reports[0].attributes).toMatchObject({
      'sessions.discovered': 2,
      'sessions.attached': 1,
      'sessions.unattached': 1,
      'sessions.keys': previousFolderSessionTraceKey('wt::/b@@2')
    })
  })

  it('stays silent when the previous folder had no sessions', () => {
    const trace = new PreviousFolderSessionTrace(1_000)
    trace.recordDiscovered(new Map([['wt::/c@@3', own]]))
    vi.advanceTimersByTime(5_000)
    trace.reportUnattached('quit')
    expect(spans).toEqual([])
  })
})
