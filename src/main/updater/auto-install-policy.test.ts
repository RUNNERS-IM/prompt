import { describe, expect, it } from 'vitest'
import {
  canAutoInstallNow,
  parseAutoInstallRecord,
  resolveAutoInstallRecordOnLaunch
} from './auto-install-policy'

describe('auto install policy', () => {
  it('installs only after 10 idle minutes with no agent writing an answer', () => {
    expect(canAutoInstallNow({ idleSeconds: 599, workingAgentCount: 0 })).toBe(false)
    expect(canAutoInstallNow({ idleSeconds: 600, workingAgentCount: 1 })).toBe(false)
    expect(canAutoInstallNow({ idleSeconds: 600, workingAgentCount: 0 })).toBe(true)
  })

  it('turns the downloaded version into a one-time notice once it is running', () => {
    expect(
      resolveAutoInstallRecordOnLaunch(
        { pendingVersion: '2.6.111902', noticeVersion: null },
        '2.6.111902'
      )
    ).toEqual({ pendingVersion: null, noticeVersion: '2.6.111902' })
  })

  it('keeps waiting while the old version still runs and forgets a skipped one', () => {
    const pending = { pendingVersion: '2.6.111902', noticeVersion: null }
    expect(resolveAutoInstallRecordOnLaunch(pending, '2.6.111901')).toBe(pending)
    expect(resolveAutoInstallRecordOnLaunch(pending, '2.6.112001')).toEqual({
      pendingVersion: null,
      noticeVersion: null
    })
  })

  it('reads a broken record as empty', () => {
    expect(parseAutoInstallRecord('x')).toEqual({ pendingVersion: null, noticeVersion: null })
    expect(parseAutoInstallRecord({ pendingVersion: 3, noticeVersion: '2.6.1' })).toEqual({
      pendingVersion: null,
      noticeVersion: '2.6.1'
    })
  })
})
