# 런타임 권한 경계

NDX에서 가장 중요한 아키텍처 규칙은 에이전트 실행 권한을 session server 밖으로 내보내지 않는 것이다.

## 권한별 소유자

| 권한 | 소유 위치 | 이유 |
| --- | --- | --- |
| agent turn loop | `packages/ndx/src/agent/turnloop` | 모델 요청, 도구 호출, sessiondata append 순서를 한 곳에서 보장한다. |
| tool registry/execution | `packages/ndx/src/agent/tool` | user/project/builtin tool 병합과 allowlist를 runtime domain에서 판단한다. |
| hook runtime | `packages/ndx/src/agent/hook` | hook effect가 prompt ordering과 turn lifecycle에 영향을 주기 때문이다. |
| session persistence | `packages/ndx/src/agent/session` | context reconstruction의 source of truth다. |
| socket transport | `apps/ndx/src/server/agent` | connected client로 event를 전달하지만 domain authority는 갖지 않는다. |
| browser rendering | `apps/ndx/src/webclient_front` | 세션 상태를 표시하고 사용자 입력을 보낸다. |

## Web client 경계

웹 클라이언트는 다음을 할 수 있다.

| 가능 | 설명 |
| --- | --- |
| 세션 목록 요청 | HTTP API를 통해 서버가 가진 목록을 받는다. |
| 세션 socket 연결 | active session event와 history를 받는다. |
| 사용자 입력 전송 | session request payload를 보낸다. |
| client request 응답 | `askUserQuestion` 같은 function tool의 browser-side 응답을 보낸다. |

웹 클라이언트는 다음을 하면 안 된다.

| 금지 | 이유 |
| --- | --- |
| tool 직접 실행 | 파일 시스템/프로세스 권한이 client에 생긴다. |
| model 직접 호출 | context reconstruction과 persistence가 깨진다. |
| sessiondata 직접 생성 | append ordering과 prefix-cache 계약이 깨진다. |
| authoritative running flag 유지 | crash recovery가 불가능해진다. |

## Settings 경계

Settings surface는 운영과 계정/설정을 편집하지만 agent turn을 대신 실행하지 않는다. 설정 변경이 agent behavior에 영향을 주더라도 실행 권한은 `packages/ndx/src/agent`가 가진다. Settings domain logic은 `packages/ndx/src/webclient/server/settings`에 두고, `apps/ndx/src/server/web/webclient/settings`는 HTTP orchestration만 맡는다.

## Socket server 경계

`apps/ndx/src/server/agent`는 HTTP server에 WebSocket을 붙이고, socket-local session grant, history replay, downstream event broadcast를 다룬다. 하지만 최종적으로 turn을 시작하고 데이터를 쓰는 함수는 agent package의 domain API다.

이 경계가 필요한 이유는 간단하다. transport가 늘어나도 agent semantics가 하나여야 한다. Web, future CLI, settings UI, remote client가 생겨도 같은 PostgreSQL session truth와 같은 turn loop를 사용해야 한다.
