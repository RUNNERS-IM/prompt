// Prompt 의 Windows 정식 판은 코드 서명 인증서 없이 낸다. 원래 설정(config/electron-builder.config.cjs)은
// 서명 인증서 이름으로 publisherName 'Runners Co., Ltd' 를 넣고, 앱이 업데이트 파일의
// 서명자를 확인하게(verifyUpdateCodeSignature 기본값 true) 둔다. 서명 없는 설치 파일로 그대로 내면
// 설치된 앱이 다음 업데이트를 "서명이 다르다"며 거부한다.
// 그래서 원래 설정을 그대로 불러와 Windows 의 이 두 가지만 끈다. upstream 을 병합해도 원래 파일과 충돌하지 않게 따로 둔다.
const base = require('../electron-builder.config.cjs')

const { publisherName: _publisherName, ...signtoolOptions } = base.win?.signtoolOptions ?? {}

module.exports = {
  ...base,
  win: {
    ...base.win,
    signtoolOptions,
    verifyUpdateCodeSignature: false
  }
}
