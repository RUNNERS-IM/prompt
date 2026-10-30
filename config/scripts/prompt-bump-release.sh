#!/usr/bin/env bash
# release 빌드 전에 package.json 의 version 을 올린다.
#
# 규칙(2026-10-30 사용자 결정 6B): 2.{연도 끝자리}.{MMDD}{NN}, 날짜는 출시일(KST).
#   NN 은 그날 몇 번째 출시인지를 두 자리로 적은 것이다(01 부터 99 까지).
#   예) 2026-10-30 첫 출시 2.6.103001, 같은 날 두 번째 2.6.103002
#
# 왜 첫 출시부터 01 을 붙이나: Electron 쪽(electron-builder, electron-updater, 앱 안의
# updater-prerelease-feed.ts)은 버전을 semver(숫자 세 자리)로만 읽는다. Split 처럼 넷째 자리
# (2.6.1030.2)를 붙일 수 없어서 셋째 자리 끝에 두 자리를 붙인다. 첫 출시를 2.6.1030 으로 두면
# 두 번째가 2.6.103002 가 되어 숫자가 갑자기 커지고, 옛 규칙으로 이미 낸 2.6.1030 보다도
# 새 번호가 언제나 커야 하므로 하루의 첫 출시도 01 을 붙인다.
#   - 같은 날: 2.6.1030(옛 규칙) < 2.6.103001 < 2.6.103002
#   - 다른 날: MMDD 가 커지면 MMDDNN 도 커진다. 1월 5일은 0 을 떼고 2.6.10501 이 된다.
#     (10501 < 103001 처럼 자릿수가 달라도 숫자 크기 순서가 날짜 순서와 같다)
#   - 해가 바뀌면 가운데 자리(연도 끝자리)가 커지므로 셋째 자리가 작아져도 된다.
#
# 다음 번호 찾기: 저장소의 태그 v2.{연도}.{MMDD}NN 중 가장 큰 NN 에 1 을 더한다.
# 옛 규칙 태그 v2.{연도}.{MMDD}(NN 없음)는 00 으로 친다. 태그는 GitHub 초안을 공개할 때 생기므로
# 워크플로는 fetch-depth: 0 으로 태그를 모두 받아 온 뒤 이 스크립트를 부른다.
#
# 멈춘 배포를 다시 돌리면(package.json 이 이미 오늘 번호이고 그 태그가 아직 없으면) 같은 버전을 다시 쓴다.
# 이미 그 버전이면 파일을 고치지 않는다. 하루 99 번을 넘기면 멈춘다(종료 코드 3).
# 새 버전을 한 줄로 출력한다.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PACKAGE_JSON="$REPO_ROOT/package.json"

YEAR=$(TZ=Asia/Seoul date +%Y)
MMDD=$(TZ=Asia/Seoul date +%m%d)
# 10#: 0 으로 시작하는 0105 같은 값을 8진수로 읽지 않게 한다. 1월 5일은 105 가 된다.
DAY_PREFIX="2.$((YEAR % 10)).$((10#$MMDD))"

CURRENT=$(node -p "require('$PACKAGE_JSON').version")

# 멈춘 배포 다시 돌리기: 오늘 번호가 이미 package.json 에 있고 태그가 아직 없으면 그대로 쓴다.
if [[ "$CURRENT" =~ ^${DAY_PREFIX//./\\.}[0-9]{2}$ ]] &&
  ! git -C "$REPO_ROOT" rev-parse -q --verify "refs/tags/v$CURRENT" >/dev/null; then
  VERSION="$CURRENT"
else
  # 오늘 낸 태그 중 가장 큰 NN. 옛 규칙 v$DAY_PREFIX 는 00.
  LAST=-1
  while IFS= read -r tag; do
    suffix="${tag#v$DAY_PREFIX}"
    if [[ -z "$suffix" ]]; then
      nn=0
    elif [[ "$suffix" =~ ^[0-9]{2}$ ]]; then
      nn=$((10#$suffix))
    else
      continue
    fi
    ((nn > LAST)) && LAST=$nn
  done < <(git -C "$REPO_ROOT" tag -l "v$DAY_PREFIX" "v$DAY_PREFIX[0-9][0-9]")

  NEXT=$((LAST < 0 ? 1 : LAST + 1))
  if ((NEXT > 99)); then
    echo "오늘($DAY_PREFIX) 이미 99 번 출시했다. 두 자리 번호를 넘으므로 멈춘다." >&2
    exit 3
  fi
  VERSION="$DAY_PREFIX$(printf '%02d' "$NEXT")"
fi

# JSON 을 다시 쓰지 않고 version 한 줄만 바꾼다. 들여쓰기·키 순서가 그대로라 upstream 병합 때 충돌이 이 줄로만 좁혀진다.
VERSION="$VERSION" PACKAGE_JSON="$PACKAGE_JSON" node -e '
const fs = require("node:fs")
const file = process.env.PACKAGE_JSON
const text = fs.readFileSync(file, "utf8")
const next = text.replace(/^(\s*"version":\s*")[^"]*(")/m, `$1${process.env.VERSION}$2`)
if (JSON.parse(next).version !== process.env.VERSION) {
  throw new Error("package.json version was not updated")
}
if (next !== text) fs.writeFileSync(file, next)
'

echo "$VERSION"
