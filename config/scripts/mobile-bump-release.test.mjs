import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const script = join(import.meta.dirname, '../../mobile/scripts/bump-release.sh')
let made = []

// 빈 저장소에 app.json 과 스크립트를 두고 첫 커밋을 만든다.
function repo() {
  const root = mkdtempSync(join(tmpdir(), 'bump-'))
  made.push(root)
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' }).toString().trim()
  git('init', '-q')
  execFileSync('mkdir', ['-p', 'mobile/scripts'], { cwd: root })
  copyFileSync(script, join(root, 'mobile', 'scripts', 'bump-release.sh'))
  writeFileSync(
    join(root, 'mobile', 'app.json'),
    JSON.stringify({ expo: { version: '2.6.1030', ios: {}, android: {} } })
  )
  git('add', '.')
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 't')
  const run = (date) =>
    execFileSync('bash', [join(root, 'mobile', 'scripts', 'bump-release.sh')], {
      env: { ...process.env, BUMP_DATE: date }
    })
      .toString()
      .trim()
      .split('\n')
  const app = () => JSON.parse(readFileSync(join(root, 'mobile', 'app.json'), 'utf8')).expo
  return { git, run, app }
}

// 주어진 태그를 앞 커밋에 단 뒤, 새 커밋에서 정해진 날짜로 번호를 고르게 한다.
function bump(date, tags = []) {
  const { git, run, app } = repo()
  for (const tag of tags) {
    git('tag', tag)
  }
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'next')
  return { out: run(date), app: app() }
}

afterEach(() => {
  for (const root of made) {
    rmSync(root, { recursive: true, force: true })
  }
  made = []
})

describe('mobile/scripts/bump-release.sh', () => {
  it('그날 첫 출시는 01, 빌드 번호는 판 번호에서 만든다', () => {
    const { out, app } = bump('2026-11-12')
    expect(out).toEqual(['2.6.111201', '6111201', 'mobile-v2.6.111201'])
    expect(app.version).toBe('2.6.111201')
    expect(app.ios.buildNumber).toBe('6111201')
    expect(app.android.versionCode).toBe(6111201)
  })

  it('휴대폰 태그만 세고, 컴퓨터판 태그와 다른 날 태그는 보지 않는다', () => {
    const { out } = bump('2026-11-12', [
      'mobile-v2.6.111201',
      'mobile-v2.6.111202',
      'v2.6.111205',
      'mobile-v2.6.111109',
      'mobile-ios-v2.6.111207',
      'mobile-v0.0.9'
    ])
    expect(out[0]).toBe('2.6.111203')
    expect(out[1]).toBe('6111203')
  })

  it('1월 5일은 앞의 0 을 떼고, 2030 년에도 빌드 번호가 줄지 않는다', () => {
    expect(bump('2027-01-05').out.slice(0, 2)).toEqual(['2.7.10501', '7010501'])
    const next = Number(bump('2030-01-05').out[1])
    expect(next).toBe(10010501)
    expect(next).toBeGreaterThan(9123199)
  })

  it('이미 출시한 커밋을 다시 돌리면 새 번호를 만들지 않고 그 번호를 알린다', () => {
    const { git, run, app } = repo()
    const before = git('rev-parse', 'HEAD')
    expect(run('2026-11-12')).toEqual(['2.6.111201', '6111201', 'mobile-v2.6.111201'])
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'Prompt 휴대폰 2.6.111201')
    git('tag', 'mobile-v2.6.111201')
    const again = ['2.6.111201', '6111201', 'mobile-v2.6.111201', 'already']
    // release 가지 끝(번호 커밋)을 다시 꺼낸 경우
    expect(run('2026-11-12')).toEqual(again)
    // 번호 커밋 전의 커밋을 다시 꺼낸 경우: app.json 은 옛 번호 그대로 둔다
    git('checkout', '-q', before)
    expect(run('2026-11-12')).toEqual(again)
    expect(app().version).toBe('2.6.1030')
    expect(git('tag', '-l', 'mobile-v*').split('\n')).toEqual(['mobile-v2.6.111201'])
  })

  it('그날 99 번을 넘으면 멈춘다', () => {
    expect(() => bump('2026-11-12', ['mobile-v2.6.111299'])).toThrow()
  })
})
