#!/usr/bin/env bash
# 휴대폰 출시 전에 mobile/app.json 의 판 번호와 빌드 번호를 올린다. 규칙은 Monitor 휴대폰 앱(monitor-app
# scripts/bump-release.sh)과 같다. 번호는 휴대폰 태그(mobile-v2.…)만 보고 매긴다. 같은 저장소의 컴퓨터판 태그(v2.…)와
# 섞지 않고, 컴퓨터판 번호를 빌려 오지 않는다(2026-11-12 사용자 1A). 옛 upstream 휴대폰 태그(mobile-v0.0.x)는 보지 않는다.
#
# 세 줄을 출력한다: 1) 판 번호(app.json version) 2) 빌드 번호(iOS buildNumber · Android versionCode) 3) 태그
# 이미 출시한 커밋이면 네 번째 줄에 already 를 더하고 app.json 은 건드리지 않는다.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Why: 같은 커밋으로 출시를 다시 돌리면 번호를 태그만 보고 정하므로 한 커밋에 새 번호(…03)가 또 붙었다
#   (2026-11-12 [REMOTE] 개발이 찾음). HEAD, 또는 HEAD 를 부모로 둔 번호 커밋에 휴대폰 태그가 이미 있으면 그 번호를 그대로 알린다.
#   HEAD 에 붙는 경우: release 가지 끝(번호 커밋)을 다시 꺼냄. 부모인 경우: 번호 커밋 전의 커밋을 다시 꺼냄.
HEAD_SHA=$(git -C "$REPO_ROOT" rev-parse HEAD)
while IFS= read -r tag; do
  [ -n "$tag" ] || continue
  commit=$(git -C "$REPO_ROOT" rev-parse "$tag^{commit}")
  parent=$(git -C "$REPO_ROOT" rev-parse -q --verify "$commit^" || true)
  if [ "$commit" = "$HEAD_SHA" ] || [ "$parent" = "$HEAD_SHA" ]; then
    BUILD=$(git -C "$REPO_ROOT" show "$commit:mobile/app.json" | python3 -c 'import json, sys; print(json.load(sys.stdin)["expo"]["android"]["versionCode"])')
    echo "${tag#mobile-v}"
    echo "$BUILD"
    echo "$tag"
    echo already
    exit 0
  fi
done < <(git -C "$REPO_ROOT" tag -l 'mobile-v2.*' --sort=-creatordate)

# 버전 규칙(네 앱 같음): 2.{연도 끝자리}.{MMDD}{NN}. 날짜는 휴대폰 출시일(KST), NN 은 그날 몇 번째 휴대폰 출시인지(01~99).
#   예) 그날 첫 출시 2.6.111201, 두 번째 2.6.111202. 1월 5일은 앞의 0 을 떼고 2.6.10501.
# BUMP_DATE=YYYY-MM-DD 는 시험에서만 날짜를 정해 넣는다.
if [ -n "${BUMP_DATE:-}" ]; then
  YEAR=${BUMP_DATE:0:4}
  MMDD=${BUMP_DATE:5:2}${BUMP_DATE:8:2}
else
  YEAR=$(TZ=Asia/Seoul date +%Y)
  MMDD=$(TZ=Asia/Seoul date +%m%d)
fi
# 10#: 0 으로 시작하는 0105 같은 값을 8진수로 읽지 않게 한다.
DAY="2.$((YEAR % 10)).$((10#$MMDD))"
LAST=0
while IFS= read -r tag; do
  suffix="${tag#mobile-v"$DAY"}"
  [[ "$suffix" =~ ^[0-9]{2}$ ]] || continue
  nn=$((10#$suffix))
  [ "$nn" -gt "$LAST" ] && LAST=$nn
done < <(git -C "$REPO_ROOT" tag -l "mobile-v${DAY}[0-9][0-9]")
NEXT=$((LAST + 1))
if [ "$NEXT" -gt 99 ]; then
  echo "오늘($DAY) 이미 99 번 출시했습니다. 두 자리 번호를 넘으므로 멈춥니다." >&2
  exit 3
fi
VERSION="$DAY$(printf '%02d' "$NEXT")"
# 빌드 번호는 판 번호에서 만든다: (연도 - 2020) × 1000000 + MMDD × 100 + NN. 2.6.111201 → 6111201.
#   연도 끝자리가 아니라 2020 부터 센 햇수를 써서 2030 년(10010501)에도 줄지 않는다. 스토어는 빌드 번호가 늘 커져야 받는다.
BUILD=$(( (YEAR - 2020) * 1000000 + 10#$MMDD * 100 + NEXT ))

python3 - "$REPO_ROOT/mobile/app.json" "$VERSION" "$BUILD" <<'PY'
import json, sys
path, version, build = sys.argv[1], sys.argv[2], int(sys.argv[3])
data = json.load(open(path, encoding="utf-8"))
expo = data["expo"]
expo["version"] = version
expo.setdefault("ios", {})["buildNumber"] = str(build)
expo.setdefault("android", {})["versionCode"] = build
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
PY

echo "$VERSION"
echo "$BUILD"
echo "mobile-v$VERSION"
