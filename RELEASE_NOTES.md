## 한국어

- 설정의 한국어 문구를 다듬었습니다. 「repo」는 「저장소」로, 「글로벌 사용」은 「전역 설정 사용」으로, 「바로가기」는 「단축키」로 바꾸고, 단축키 화면의 설명 문장을 알아보기 쉽게 고쳤습니다.
- 설정 > 저장소의 소스 컨트롤 AI 작업(커밋 메시지 만들기 등) 이름과 상태가 영어로만 나오던 것을 20개 언어로 보여 드립니다.
- 설정 > 터미널 미리보기의 예시 경로가 `~/orca` 로 나오던 것을 `~/prompt` 로 고쳤습니다.
- RUNNERS 계정을 만들 때 비밀번호 형식이 맞지 않으면, 같은 안내가 회색 글과 빨간 글로 두 번 나오던 것을 빨간 오류 한 줄만 나오게 했습니다.
- 오른쪽 「프롬프트」 칸에 자주 쓰는 프롬프트를 모아 보여 드립니다. 처음 켜면 기본 프롬프트 10개(작업 계획 · 원인 찾기 · 커밋 등)가 들어 있고, 같은 글을 5번 이상 치면 「자주 씀」에 저절로 들어갑니다(지운 글은 다시 넣지 않고, 친 글은 이 컴퓨터에만 남습니다). 빈 칸과 찾기 결과가 없을 때는 그림과 「새 프롬프트」 단추를 보여 드립니다.

## English

- Polished the Korean wording in Settings: "repo", "global" and "shortcut" now use consistent Korean terms, and the explanations on the Shortcuts page are easier to read.
- Names and states of the source control AI actions in Settings > Repository (such as generating a commit message), which used to appear only in English, are now shown in 20 languages. "Orca default prompt" now reads "Default prompt".
- The sample path in the Settings > Terminal preview now shows `~/prompt` instead of `~/orca`.
- When you create a RUNNERS account with a password in the wrong format, the rule no longer appears twice (once in gray, once in red); only the red error line is shown.
- The Prompts panel on the right now collects prompts you use often. It starts with 10 default prompts (work plan, find the cause, commit and more), and text you type 5 or more times is added to "Used often" automatically (deleted items are never added back, and what you type stays on this computer). An empty panel or a search with no results shows a picture and a "New prompt" button.
