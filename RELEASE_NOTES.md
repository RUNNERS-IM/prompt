## 한국어

- Claude 계정을 바꾸면(계정 줄 고르기 · 세션 안 `/login` · 자동 고르기 · `prompt account select`) 이 맥의 모든 Claude 세션이 새 계정으로 옮겨 갑니다. 일하던 세션은 하던 턴이 끝난 뒤 옮겨 갑니다. 설정에서 다르게 고를 수 있습니다.
- 주간 한도 등 사용 한도로 멈춘 세션은 사이드바와 탭에 「Failed」 대신 「사용 한도 도달」로 보이고, 「What do you want to do?」 고르기 창에 멈춘 세션도 한도로 멈춘 세션으로 알아봅니다.
- 한도로 멈춘 세션은 새 계정으로 다시 시작한 뒤 「이어서 해 주세요」 한 줄을 받아 하던 일을 이어 갑니다. 고르기 창이 다시 시작을 막지 않습니다.
- 새 명령 `prompt session restart [<세션>] [--all] [--limited] [--continue "<글>"]` 로 세션을 지금 계정에서 다시 시작합니다. 이미 같은 계정이면 이어서 하라는 글만 보냅니다.
- 다시 시작 알림을 한 장으로 묶었습니다. 「Claude 세션 N개를 새 계정으로 다시 시작하는 중」이 끝나면 「세션 N개를 다시 시작했습니다 · 실패 M개」로 바뀌고 5초 뒤 닫힙니다.
- 세션에서 `/login` 으로 계정을 더하면 계정이 저장되고 바로 쓰는 계정이 됩니다. 같은 계정이 「시스템 기본」과 저장된 줄로 두 번 보이지 않습니다.
- 사이드바 계정 줄 메뉴를 닫은 뒤 입력 위치가 엉뚱한 곳으로 가던 것을 고쳤습니다.

## English

- Changing the Claude account (picking an account row, `/login` in a session, automatic switching or `prompt account select`) now moves every Claude session on this Mac to the new account. A session in the middle of a turn moves once that turn ends. You can choose differently in Settings.
- Sessions stopped by a usage limit, including the weekly limit, now show "Usage limit reached" instead of "Failed" in the sidebar and tab, and sessions waiting on the "What do you want to do?" picker are recognised as limit stops too.
- Sessions stopped by a limit restart on the new account and receive a line asking them to continue their work. The limit picker no longer blocks the restart.
- New command `prompt session restart [<session>] [--all] [--limited] [--continue "<text>"]` restarts sessions on the current account, or only sends the continue line when they are already on it.
- Restarts now share one notification: "Restarting N Claude sessions on the new account" turns into "Restarted N sessions · M failed" and closes after 5 seconds.
- Adding an account with `/login` in a session now saves it and makes it the account in use. The same account no longer appears twice as "System default" and as a saved row.
- Fixed focus jumping to the wrong place after closing the account row menu in the sidebar.
