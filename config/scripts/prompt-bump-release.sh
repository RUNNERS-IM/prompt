#!/usr/bin/env bash
# release 빌드 전에 package.json 의 version 을 올린다. Split·센스·푸딩과 같은 규칙:
# 출시일(KST) 기준 2.{연도 끝자리}.{MMDD}. 예) 2026-10-30 -> 2.6.1030
#
# Split 은 같은 날 이미 낸 버전이 있으면 2.6.1030.2 처럼 넷째 자리를 붙이지만,
# Electron 쪽(electron-builder, electron-updater, 앱 안의 updater-prerelease-feed.ts)은
# 버전을 semver(숫자 세 자리)로만 읽는다. 넷째 자리는 semver 가 아니라 빌드가 멈추거나
# 업데이트 목록에서 빠진다. 그래서 같은 날 두 번째 출시는 일단 막고(종료 코드 3) 이유를 알린다.
# 같은 날 여러 번 내는 방식은 아직 정하지 않았다.
#
# 멈춘 배포를 다시 돌리면(태그가 아직 없으면) 같은 버전을 다시 쓴다. 이미 그 버전이면 파일을 고치지 않는다.
# 새 버전을 한 줄로 출력한다.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PACKAGE_JSON="$REPO_ROOT/package.json"

YEAR=$(TZ=Asia/Seoul date +%Y)
MMDD=$(TZ=Asia/Seoul date +%m%d)
# 10#: 0 으로 시작하는 0105 같은 값을 8진수로 읽지 않게 한다. 1월 5일은 2.6.105 가 된다.
VERSION="2.$((YEAR % 10)).$((10#$MMDD))"

if git -C "$REPO_ROOT" rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null; then
  echo "v$VERSION 태그가 이미 있다. 오늘 이미 출시했다." >&2
  echo "Electron 버전은 semver 라 Split 처럼 $VERSION.2 를 붙일 수 없다. 같은 날 다시 내는 방식을 정할 때까지 멈춘다." >&2
  exit 3
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
