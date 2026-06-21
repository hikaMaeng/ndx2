# Chat 모드

NDX chat은 project coding session과 다른 runtime이다. 사용자는 같은 웹 클라이언트에서 chat folder와 chat session을 볼 수 있지만, 내부적으로는 `chatfolder`, `chatsession`, `chatsessiondata` 테이블을 사용하고 project path를 갖지 않는다.

## project session과의 차이

| 항목 | project coding session | chat session |
| --- | --- | --- |
| 소유 테이블 | `session`, `sessiondata` | `chatsession`, `chatsessiondata` |
| project path | 필수 | 없음 |
| folder | project 기준 | `chatfolder` 기준 |
| tool authority | coding tools 가능 | allowlist 기반 읽기/검색 중심 |
| context prelude | AGENTS/project/environment 포함 | chat 전용 environment 포함 |
| 파일 mutation | 가능 | 금지 |

## chat context

`packages/ndx/src/agent/chat/context`는 chat 전용 base messages를 만든다. developer message는 이 session이 repository development나 file editing이 아니라고 명시하고, user message에는 `folderid`, `chatsessionid`, `user_home`만 넣는다.

## 허용 도구

`packages/ndx/src/agent/chat/tool/policy.ts`의 allowlist는 다음 도구만 허용한다.

| 도구 | 이유 |
| --- | --- |
| `cot_work` | 긴 응답을 정리하는 작업 메모. |
| `getImage` | 이미지 리소스 조회. |
| `loadSkill` | advisory skill loading. |
| `glob` | 파일 목록 확인. |
| `grep_search` | 텍스트 검색. |
| `read_file` | 파일 읽기. |
| `web_fetch` | 웹 문서 조회. |
| `web_search` | 웹 검색. |

`bash`, `edit`, `write_file` 같은 mutation 도구는 chat session에 노출되지 않는다. 또한 `executeToolCalls`에는 `denyToolResultEffects: true`가 전달되어 tool result effect로 파일 변경성 user message를 우회 삽입하는 경로도 막는다.

## iteration 제한

현재 chat turn loop는 최대 12 iteration을 돈다. coding session의 runtime setting 기반 max iteration과 다르며, chat은 더 좁은 도구 권한과 짧은 루프를 기준으로 설계되어 있다.

## 설계 이유

사용자는 일반 대화와 프로젝트 작업을 같은 제품에서 할 수 있어야 하지만, 두 표면의 권한은 달라야 한다. Chat이 project session 권한을 그대로 받으면 사용자가 단순 질의라고 생각한 요청이 파일 mutation으로 이어질 수 있다. 그래서 chat은 별도 tables, 별도 context, 별도 allowlist를 가진다.
