# Webclient HTTP API

Webclient HTTP API는 `apps/ndx/src/server/web/webclient`가 Express route wiring을 소유한다. 이 계층은 browser client가 필요한 metadata, workspace 탐색, project/session/chat/model/client-state 요청을 HTTP로 제공한다. Agent loop와 tool execution은 이 route layer가 아니라 `packages/ndx/src/agent`가 계속 소유한다.

## route groups

| attach 함수 | 역할 |
| --- | --- |
| `attachAgentWebMetadataRoutes` | version, session socket URL, workspace root metadata. |
| `attachAgentWebUserRoutes` | webclient user/account surface. |
| `attachAgentWebWorkspaceRoutes` | `/ndx/workspace` 하위 directory 탐색. |
| `attachAgentWebProjectRoutes` | project list/create/delete/user selection. |
| `attachAgentWebModelRoutes` | provider/model settings. |
| `attachAgentWebChatRoutes` | chat folder/session/message APIs. |
| `attachAgentWebSessionRoutes` | project session metadata APIs. |
| `attachAgentWebClientStateRoutes` | browser client state persistence. |

`attachAgentWebRoutes`는 `/api/agent`에 request/complete logging middleware를 붙인 뒤 위 route group을 순서대로 등록한다.

## metadata

Metadata API는 browser가 WebSocket endpoint와 workspace mapping을 스스로 추정하지 않게 한다. response에는 `session.path`, `healthUrl`, `socketUrl`, host/container workspace root가 포함된다. 이 값은 VS Code 링크, project picker, socket 연결에 사용된다.

## workspace directories

Workspace directory API는 `toServerWorkspacePath`로 path를 검증하고, `.git`, `node_modules`, `.yarn`을 제외한 directory만 반환한다. workspace 밖 path는 400으로 거절한다. Browser가 임의 absolute path를 직접 열지 못하게 하는 중요한 boundary다.

## chat routes

Chat route는 `chatfolder`, `chatsession`, `chatsessiondata`를 다룬다. folder 목록 요청은 root folder를 보장하고, chat message submit은 `runChatSessionTurn`을 호출한다. 이 route는 project session socket과 다르게 HTTP request/response로 chat turn을 수행하지만, tool 권한은 chat runtime allowlist로 제한된다.

## database unavailable

대부분 route는 database가 없으면 503을 반환한다. 테스트나 부분 초기화 환경에서 route가 process crash를 내지 않고 명시적인 unavailable response를 내기 위한 정책이다.

## 설계 이유

Webclient API는 browser 편의용 facade다. Browser state, model form, workspace picker는 HTTP API가 필요하지만, session execution authority를 HTTP route에 넣으면 socket turn loop와 분리된 실행 경로가 생긴다. 따라서 route는 domain function 호출과 DTO 변환만 수행하고, product invariant는 package domain이 가진다.
