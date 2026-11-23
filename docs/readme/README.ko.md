<p align="center">
  <img src="https://runners.im/images/apps/prompt/icon.webp" width="96" alt="Prompt">
</p>
<h1 align="center">Prompt</h1>
<p align="center"><b>Claude 세션 여럿을 한 창에서.</b><br>여러 Claude Code 세션을 프로젝트별로 묶어 한 창에서 돌리는 맥용 터미널입니다.</p>
<p align="center">
  <a href="https://github.com/RUNNERS-IM/prompt/releases/latest/download/prompt-macos-arm64.dmg"><b>맥용 받기</b></a> ·
  <a href="https://runners.im/prompt">runners.im/prompt</a> ·
  <a href="../../README.md">English</a>
</p>
<p align="center"><sub>무료 · macOS 12 이상 · Apple silicon · 20개 언어</sub></p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/prompt/stage-ko-dark.webp">
  <img src="https://runners.im/images/apps/prompt/stage-ko-light.webp" alt="Prompt 창 전체: 왼쪽에 프로젝트별 세션 목록, 가운데 Claude 터미널, 오른쪽에 파일 목록">
</picture>

## 할 수 있는 일

<table>
<tr>
<td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/prompt/projects-ko-dark.webp"><img src="https://runners.im/images/apps/prompt/projects-ko-light.webp" alt="프로젝트 아래 워크스페이스와 세션 줄, 줄마다 지금 상태"></picture><br><b>세션이 지금 무엇을 하는지 한눈에</b><br>프로젝트 아래에 세션이 한 줄씩 붙고, 줄마다 ‘파일 고치는 중’, ‘명령 실행 중’, ‘끝남 · 답을 기다림’처럼 지금 하는 일이 보입니다.</td>
<td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/prompt/worktrees-ko-dark.webp"><img src="https://runners.im/images/apps/prompt/worktrees-ko-light.webp" alt="한 프로젝트 아래 워크스페이스 두 개(main · fix-login)와 세션 터미널"></picture><br><b>작업마다 따로 워크스페이스</b><br>워크스페이스마다 git 워크트리가 따로 생겨, 여러 세션이 같은 파일을 덮어쓰지 않습니다.</td>
</tr>
<tr>
<td valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/prompt/keep-running-ko-dark.webp"><img src="https://runners.im/images/apps/prompt/keep-running-ko-light.webp" alt="앱을 다시 켠 뒤에도 끊기지 않고 이어지는 빌드 로그"></picture><br><b>꺼도 세션은 계속</b><br>Prompt 를 종료해도 터미널은 뒤에서 계속 돌고, 다시 켜면 그대로 이어 붙습니다. 모두 끄려면 메뉴 막대 아이콘에서 ‘완전히 종료…’를 고릅니다.</td>
<td valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/prompt/folders-ko-dark.webp"><img src="https://runners.im/images/apps/prompt/folders-ko-light.webp" alt="프로젝트마다 붙은 글자 로고, git 이 아닌 폴더도 같은 목록에"></picture><br><b>git 이 아니어도, 로고로 구분</b><br>git 저장소가 아닌 폴더도 프로젝트로 추가하고, 프로젝트마다 로고를 붙여 목록에서 바로 알아봅니다.</td>
</tr>
<tr>
<td valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/prompt/usage-ko-dark.webp"><img src="https://runners.im/images/apps/prompt/usage-ko-light.webp" alt="아래 상태 막대의 Claude 사용량"></picture><br><b>사용량과 끝난 세션을 놓치지 않게</b><br>아래 상태 막대에서 Claude 사용량을 보고 한도에 걸리기 전에 압니다. 세션이 일을 마치면 macOS 알림이 뜹니다.</td>
<td valign="top"><b>다른 맥의 세션도 같은 창에서</b><br>사이드바 맨 위 컴퓨터 이름을 눌러 다른 맥으로 넘어갑니다. 세션이 도는 맥에서 ‘이 컴퓨터 공유…’로 링크를 만들고, 다른 맥의 ‘컴퓨터 추가…’에 붙여 넣습니다.</td>
</tr>
</table>

## 설치

[`prompt-macos-arm64.dmg`](https://github.com/RUNNERS-IM/prompt/releases/latest/download/prompt-macos-arm64.dmg) 를 받아 열고 Prompt 를 응용 프로그램 폴더로 끌어 놓습니다. 맥판은 Apple 의 서명 · 공증을 받아 보안 경고 없이 열립니다. Intel 맥판은 없습니다.

[Releases](https://github.com/RUNNERS-IM/prompt/releases/latest) 쪽에는 Windows 설치 파일(`prompt-windows-setup.exe`, 아직 코드 서명이 없어 처음 한 번 SmartScreen 경고가 뜸)과 Linux 판(`.AppImage` · `.deb` · `.rpm`)도 있습니다.

Prompt 는 Releases 에서 새 판을 찾아 설치를 권합니다. 메뉴 막대 아이콘이나 앱 메뉴의 ‘업데이트 확인’으로 직접 확인할 수도 있습니다.

## 명령 줄

Prompt 에는 `prompt` 라는 명령이 들어 있습니다. Prompt 안의 터미널에서는 바로 쓸 수 있고, 다른 터미널에서 쓰려면 설정 › 일반 › CLI 에서 켜면 `/usr/local/bin` 에 `prompt` 가 등록됩니다. `prompt --help` 로 모든 명령(`prompt project list`, `prompt session list` 등)을 볼 수 있습니다. 옛 이름 `orca` 는 없어지는 중이니 `prompt` 를 쓰세요.

## 개인정보

Prompt 는 Orca 의 서버와 통신하지 않고, 사용 기록을 보내지 않습니다. JavaScript 오류가 나면 오류 종류 · 코드 줄 · 앱 판 · OS 판만 RUNNERS 의 Sentry 로 보냅니다. 이메일 · 토큰 · 홈 폴더 이름 · 컴퓨터 이름 · 창 제목 · 입력한 글 · 요청 본문은 보내기 전에 지웁니다. IP 주소 · 화면 사진 · 녹화 · 콘솔 기록 · 충돌 덤프는 보내지 않습니다.

## Orca 기반

Prompt 는 Stably AI 의 [Orca](https://github.com/stablyai/orca) 를 바탕으로 합니다. 터미널 · 워크트리 · 편집기 같은 바탕은 Orca 에서 왔고, Prompt 는 두 단 사이드바 · 세션별 모델 메뉴 · 여러 창 · 메뉴 막대 아이콘 · 맥끼리 세션 열기를 더하고 Orca 전용 서비스는 감췄습니다. 설정과 세션은 따로 `Prompt` 폴더에 두며, 처음 켤 때 기존 Orca 폴더를 복사해 옵니다. Orca 원래 README 는 [docs/upstream/README.orca.md](../upstream/README.orca.md) 에 있습니다.

## 라이선스

Copyright (c) 2026 Runners Co., Ltd. All rights reserved. [LICENSE](../../LICENSE) 를 보세요. Orca 는 MIT 라이선스(Copyright (c) 2026 Lovecast Inc.)로 배포되며, 그 고지와 다른 외부 구성 요소 고지는 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) 에 있습니다.

---

<p align="center"><a href="https://runners.im"><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/icons/logos/RUNNERS_H_W.svg"><img src="https://runners.im/icons/logos/RUNNERS_H.svg" height="20" alt="RUNNERS"></picture></a><br><sub>RUNNERS 가 만듦 · Orca(MIT) 기반</sub></p>
