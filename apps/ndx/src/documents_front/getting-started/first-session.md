# 첫 세션 만들기

세션은 프로젝트 경로, 모델 설정, append-only 실행 이력을 묶는 실행 단위다. 브라우저는 세션을 표시하고 요청을 보낼 뿐이며, 에이전트 루프와 도구 실행 권한은 세션 서버 안에 있다.

쉽게 말하면 **세션은 "한 프로젝트에서 에이전트와 나눈 하나의 작업 대화"** 다. 하나의 프로젝트 폴더 안에서 여러 세션을 만들 수 있고, 각 세션은 자기만의 대화 이력과 모델 설정을 가진다. 세션을 닫았다가 다시 열어도, 브라우저를 새로고침해도, 다른 기기에서 같은 세션을 열어도 이력이 그대로 보이는 이유는 모든 기록이 브라우저가 아니라 서버(PostgreSQL)에 남기 때문이다. 그래서 "작업이 날아갈까" 걱정 없이 길게 이어 쓸 수 있다.

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

## 예시: 첫 요청 해보기

새 세션을 만든 직후, composer에 이렇게 입력해 보면 흐름을 가장 빠르게 이해할 수 있다.

```text
이 프로젝트 구조를 훑어보고, README가 있으면 핵심만 3줄로 요약해줘.
```

요청을 보내면 화면에서 다음 순서가 펼쳐진다.

1. 입력한 user 메시지가 대화 맨 아래에 고정된다.
2. 그 아래로 에이전트의 turn이 접힌 카드 형태로 붙는다 — 모델 요청 → `glob`/`read_file` 같은 도구 호출 → 도구 결과 → 최종 답변 순서.
3. 오른쪽 사이드바에서 방금 turn의 모델/도구/추론 세부를 펼쳐 볼 수 있다.

여기서 핵심은 **에이전트가 "추측"이 아니라 실제 파일을 읽고 답한다**는 점이다. 도구 호출 카드를 펼치면 어떤 파일을 근거로 답했는지 그대로 확인할 수 있다. 요청이 모호할수록 에이전트가 엉뚱한 곳을 보므로, "무엇을 / 어디까지 / 어떻게 확인" 을 한 줄이라도 적어주는 편이 결과가 좋다(자세한 요령은 "바이브코딩 작업 흐름" 문서를 참고).

## 세션이 저장하는 주요 값

| 값 | 설명 |
| --- | --- |
| `sessionid` | UUID 기반 세션 식별자. |
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
