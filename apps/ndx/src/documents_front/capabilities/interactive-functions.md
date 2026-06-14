# 상호작용 함수 도구

Function tool은 shell process가 아니라 TypeScript 함수로 실행되는 도구다. 현재 핵심 function tool은 `askUserQuestion`, `session_history`다.

## askUserQuestion

`askUserQuestion`은 agent가 실행 중인 turn에서 사용자 확인이 필요할 때 connected client에 질문을 보낸다.

| 단계 | 설명 |
| --- | --- |
| 1 | model이 `askUserQuestion` tool call을 생성한다. |
| 2 | tool executor가 session client bridge로 `session.client.request`를 broadcast한다. |
| 3 | 연결된 브라우저가 dialog를 보여준다. |
| 4 | 첫 유효 `session.client.response`를 tool result로 기록한다. |
| 5 | 다음 model request는 tool result row를 포함해 재구성된다. |

질문/답변은 별도 user message row가 아니다. 같은 정보를 user row와 tool result로 중복 노출하면 model-visible history가 흔들린다.

## session_history

`session_history`는 `sessionsearch`를 조회한다.

| scope | 의미 |
| --- | --- |
| all sessions | 전체 NDX session 검색. |
| project sessions | 같은 project 범위 검색. |
| one session | 특정 session history 검색. |

Scope를 생략하면 현재 project 범위를 검색한다. Embeddings 설정이 있으면
vector ranking을 함께 쓰고, 없으면 Korean FTS ranking으로 동작한다. 두
검색 경로 모두 lexical substring fallback을 사용해 코드 식별자 prefix를
찾는다. 검색 대상은 user request와 final assistant answer projection이다.

## interruption

Function tool도 interrupt 대상이다. `askUserQuestion`이 답변을 기다리던 중 turn interrupt가 들어오면 pending browser request를 닫고 cancelled result를 반환해야 한다. 브라우저 dialog만 닫고 tool result를 남기지 않으면 모델 history가 끊어진다.
