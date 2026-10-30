// Windows 실행 파일(PE)의 버전 칸은 숫자 넷이고 칸마다 0~65535 까지만 들어간다.
// Prompt 출시 버전 2.{연도}.{MMDD}{NN}(예: 2.6.103001)은 셋째 칸이 이 한도를 넘으므로
// Windows 에 적을 때만 MMDD 와 NN 을 셋째·넷째 칸으로 나눈다: 2.6.103001 → 2.6.1030.1.
// 날짜 순서가 그대로 숫자 순서가 되고, 앱 화면의 버전 표시(2.6.1030.N)와도 모양이 같다.
// 1월(2.6.10501)처럼 한도 안에 드는 날짜 버전도 똑같이 나눈다. 안 나누면 1월 2.6.10501.0 이
// 2월 2.6.201.1 보다 커 보여 순서가 뒤집힌다. 날짜로 읽히지 않는 버전(1.4.214 등)은 예전처럼 넷째 칸만 0 을 붙인다. prerelease 꼬리는 ProductVersion 에만 남는다.
const MAX_PART = 65534
// 가장 작은 날짜 버전: 1월 1일 첫 출시(1 01 01).
const MIN_DAY_VERSION = 10101

function windowsFileVersionParts(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(version ?? '')
  if (!match) {
    throw new Error(`Invalid Windows executable version: ${version}`)
  }
  const [major, minor, patch] = match.slice(1).map(Number)
  let parts = [major, minor, patch, 0]
  if (patch >= MIN_DAY_VERSION) {
    const day = Math.floor(patch / 100)
    const serial = patch % 100
    const month = Math.floor(day / 100)
    const date = day % 100
    // 날짜(MMDD)와 그날 번호(NN)로 읽히는 값만 나눈다. 그 밖의 큰 숫자는 예전처럼 거절한다.
    if (patch <= 123199 && month >= 1 && month <= 12 && date >= 1 && date <= 31 && serial >= 1) {
      parts = [major, minor, day, serial]
    }
  }
  if (parts.some((part) => part > MAX_PART)) {
    throw new Error(`Invalid Windows executable version: ${version}`)
  }
  return parts
}

function windowsFileVersion(version) {
  return windowsFileVersionParts(version).join('.')
}

module.exports = { windowsFileVersion, windowsFileVersionParts }
