# 세션 WebSocket

Session WebSocket은 `apps/ndx/src/server/agent`가 소유하는 transport surface다. 경로 기본값은 `/session`이고, 같은 Express HTTP server의 upgrade 이벤트에 붙는다. 이 계층은 browser client와 agent runtime을 연결하지만, session truth나 agent loop 자체를 소유하지 않는다.

## 연결 절차

| 단계 | 코드 | 설명 |
| --- | --- | --- |
| upgrade path 검사 | `socketServer.ts` | 요청 path가 socket path와 다르면 404로 거절한다. |
| client id 검사 | `NDX_CLIENT_ID_QUERY_PARAM` | client id가 UUID가 아니면 400으로 거절한다. |
| connection state | `SessionClientState` | client id, socket, grants, heartbeat 상태를 저장한다. |
| account selection | `requireAccountSelection` | 명시 계정이 없으면 default `ndev` 흐름을 보장한다. |
| heartbeat | `startSessionHeartbeat` | missed ping이 누적된 연결을 정리한다. |

## 메시지 책임

| 메시지 | 처리 |
| --- | --- |
| attach | session 소유권을 검증하고 현재 socket에 sessionid grant를 부여한다. |
| create | project negotiation과 account selection 후 새 session을 만든다. |
| input | attachment를 쓰고 `runAgentTurn`을 호출한다. |
| interrupt | session interrupt request를 durable state에 남긴다. |
| history summary/detail | PostgreSQL sessiondata를 요약해 browser 복구에 사용한다. |
| skill list | active session/project에서 load 가능한 skill 목록을 반환한다. |
| client response | `askUserQuestion` pending request를 해결한다. |

## client request bridge

`askUserQuestion` 같은 function tool은 turn loop 안에서 실행되지만 browser 응답이 필요하다. socket layer는 `sessionClientBridge.requestUserQuestion` 구현을 제공하고, 연결된 clients에 `session.client.request`를 broadcast한다. 첫 유효 응답만 tool result로 들어가며, cancel/interruption은 closed event와 cancelled result로 정리된다.

## event fan-out

Turn loop event는 browser-friendly `NDX_SESSION_EVENT`로 변환된다. 예를 들어 `InputRecorded`, `AssistantDelta`, `AssistantReasoning`, `ModelRequest`, `ToolCallRecorded`, `ToolProgress`, `ToolResultRecorded`, `AssistantRecorded`가 downstream message로 나간다.

## 설계 이유

Socket server가 session state machine이 되면 HTTP client, future CLI, admin surface가 각자 다른 agent semantics를 갖게 된다. 그래서 socket은 connection, grants, event translation, pending browser interaction만 담당한다. 세션 생성, history, tool execution, context reconstruction은 package domain이 계속 소유한다.
