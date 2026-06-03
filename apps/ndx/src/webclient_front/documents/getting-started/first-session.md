# 첫 세션 만들기

세션은 프로젝트 경로, 사용자 계정, 모델 설정, append-only 실행 이력을 묶는 실행 단위다. 브라우저는 세션을 표시하고 요청을 보낼 뿐이며, 에이전트 루프와 도구 실행 권한은 세션 서버 안에 있다.

## 절차

1. 웹 클라이언트에 접속한다.
2. 프로젝트 목록에서 `/ndx/workspace` 바로 아래의 작업 폴더를 고르거나 새 폴더를 만든다.
3. 프로젝트의 정체성은 그 폴더명이다.
4. 새 세션을 만든다.
5. 모델 설정에서 provider, model, context size, modality를 확인한다.
6. composer에 요청을 입력한다.
7. 요청이 WebSocket을 통해 session server로 전달된다.
8. 서버가 `sessiondata`에 user row를 append한다.
9. 서버가 PostgreSQL에서 컨텍스트를 재구성한다.
10. 모델 요청, 도구 호출, 도구 결과, 최종 응답이 같은 세션 이력에 추가된다.

## 세션이 저장하는 주요 값

| 값 | 설명 |
| --- | --- |
| `sessionid` | UUID 기반 세션 식별자. |
| `userid` | 세션 소유 계정. 기본 계정은 `ndev`. |
| `projectname` | `/ndx/workspace` 바로 아래 프로젝트 폴더명. |
| `model` | provider/model/context/modality 설정 JSON. |
| `isrunning` | 현재 turn이 실행 중인지 나타내는 서버 상태. |
| `turnphase` | interrupt와 resume 판단에 쓰는 현재 단계. |
| `runtimedata` | 다음 모델 요청에 한 번만 인라인할 attachment id 등. |

## 브라우저가 하는 일과 하지 않는 일

브라우저는 다음을 담당한다.

| 책임 | 구현 위치 |
| --- | --- |
| 세션 목록 표시 | `apps/ndx/src/webclient_front/menu` |
| 세션 화면 렌더링 | `apps/ndx/src/webclient_front/session` |
| WebSocket 연결 | `apps/ndx/src/webclient_front/session/socket` |
| 사용자 입력과 첨부 전송 | `apps/ndx/src/webclient_front/session/components/ChatComposer.tsx` |

브라우저는 다음을 소유하지 않는다.

| 금지된 소유권 | 실제 소유 위치 |
| --- | --- |
| agent loop | `packages/ndx/src/agent/turnloop` |
| tool execution | `packages/ndx/src/agent/tool` |
| inference request | `packages/ndx/src/common/responseapi`를 거친 agent turn loop |
| context reconstruction | `packages/ndx/src/agent/session`와 `turnloop/base/context/index.ts` |
| authoritative live session state | PostgreSQL |

## 세션 복구

브라우저를 새로고침하거나 다른 클라이언트가 같은 세션을 열면, 클라이언트는 로컬 메모리에서 세션을 복원하지 않는다. 서버 API와 socket history를 통해 durable row를 다시 받아 표시한다. 이 원칙 때문에 세션 데이터는 UI 이벤트 로그가 아니라 서버 권한의 실행 기록이어야 한다.
