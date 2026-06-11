# 웹 클라이언트 UI 흐름

웹 클라이언트는 `apps/ndx/src/webclient_front`에 있는 React composition이다. 사용자는 이 화면에서 project session, chat session, model provider, attachment, skill mention, turn detail을 다룬다. 중요한 점은 UI가 agent 실행 권한을 소유하지 않는다는 것이다. UI는 서버 API와 session socket에 요청을 보내고, server-owned event를 렌더링한다.

## 첫 화면

`VibeLanding`은 active project/session이 없을 때 보여주는 NDX vibe 랜딩 화면이다. 이 화면은 작업을 설명하는 marketing page가 아니라, 앱이 아직 session surface를 선택하지 않은 상태를 시각적으로 표시한다. 모바일에서는 menu button이 고정되어 있고, 데스크톱에서는 왼쪽 menu pane이 항상 보인다.

## 왼쪽 메뉴

왼쪽 menu는 `MenuController`와 `WebClientSidebar`가 구성한다.

| 영역 | 역할 |
| --- | --- |
| brand/header | NDX brand, version, 문서 새 탭 링크, 언어 전환. |
| project list | workspace project와 project session 목록. |
| chat list | chat folder와 chat session 목록. |
| settings block | runtime/model/skill/hook 설정 진입점이 들어갈 자리. |

Project controller는 project 선택, 새 session draft, session rename/delete, user 변경, VS Code 열기 요청을 다룬다. Chat controller는 folder/session 생성, rename, delete, draft 선택을 다룬다.

## session surface

`SessionSurface`는 active session 또는 draft project가 있을 때 chat-like coding surface를 렌더링한다.

| UI 요소 | 구현 |
| --- | --- |
| main scroll area | user/assistant messages와 turn flow 표시. |
| right sidebar | 최근 turn의 model/tool/reasoning 세부 흐름. |
| error alert | session request 실패를 `role="alert"`로 표시. |
| cot work overlay | 장시간 work step을 overlay로 표시. |
| composer | user input, attachment, skill mention, model 선택, send/interrupt. |

Turn flow는 user message 아래에 붙으며, model request, tool call, tool progress, tool result, reasoning을 접을 수 있는 구조로 보여준다. 이 UI는 `sessiondata`를 직접 만들지 않고 socket event와 history replay 결과를 표시한다.

## 자동 스크롤

Session surface는 active session에서 `autoScrollEnabled`가 켜져 있으면 새 event가 들어올 때 scroll bottom으로 이동한다. 사용자가 wheel, touch, empty background pointer down으로 직접 스크롤을 조작하면 manual scroll 상태가 된다. 이 상태는 긴 turn에서 사용자가 이전 tool result를 읽는 도중 화면이 강제로 아래로 튀지 않게 한다.

## 문서 링크

좌상단 문서 아이콘은 `/docs`를 `target="_blank"`로 연다. 사용자가 coding session을 유지한 채 문서 전용 사이트를 새 탭에서 읽을 수 있게 하는 요구사항의 구현 지점이다.
