# 내장 도구

NDX tool system은 process-backed tool과 function tool을 함께 다룬다. registry는 user, project, builtin root를 읽고 이름 기준으로 병합한다.

## 도구 소스

| source | 위치 |
| --- | --- |
| user plugin tools | `<userHome>/.ndx/plugins/*/tools/*` |
| user tools | `<userHome>/.ndx/tools/*` |
| project plugin tools | `<projectHome>/.ndx/plugins/*/tools/*` |
| project tools | `<projectHome>/.ndx/tools/*` |
| builtin tools | `packages/ndx/src/agent/tool/base` |

## 현재 builtin base tools

| 도구 | 런타임 | 용도 |
| --- | --- | --- |
| `bash` | process | shell command 실행. |
| `cot_work` | process | 장시간 reasoning/work checkpoint 지원. |
| `edit` | process | 파일 편집. |
| `write_file` | process | 파일 생성/쓰기. |
| `read_file` | process | 파일 읽기. |
| `glob` | process | 파일 패턴 검색. |
| `grep_search` | process | 텍스트 검색. |
| `getImage` | process | 이미지 리소스 획득. |
| `loadSkill` | process | skill body 로딩. |
| `web_fetch` | process | 웹 페이지 조회. |
| `web_search` | process | 웹 검색. |

## function tools

| 도구 | 역할 |
| --- | --- |
| `agent` | 구성된 subagent를 부모 session 아래의 child session으로 실행하고 최종 응답을 tool result로 반환한다. |
| `askUserQuestion` | 실행 중인 turn에서 연결된 브라우저에 질문을 보내고 첫 유효 응답을 tool result로 반환한다. |
| `session_history` | `sessionsearch`를 통해 이전 session 기록을 검색한다. |
| `turnplan` | 현재 session request queue를 조회/수정하고, 여러 작업 요청 사이에 성찰 요청과 마지막 요약 요청을 삽입한다. |

## allowlist

chat session은 project coding session과 권한이 다르다. chat tool policy는 mutation 도구를 막을 수 있다. 예를 들어 chat surface는 파일 수정 도구가 아니라 검색/읽기/웹/스킬 로딩 중심으로 제한된다.

## Docker runtime path

Server bundling makes the registry resolve builtin process tools from
`/app/dist/server/base`. The Dockerfile must copy
`packages/ndx/src/agent/tool/base` to that exact path. If it is copied to
`/app/dist/server/basetools`, function tools may still appear because they are
bundled JavaScript, but process tools such as `bash`, `read_file`,
`grep_search`, `edit`, and `loadSkill` disappear from the model tool list.

## tool result effects

process tool은 일반 텍스트 결과 외에 structured effect를 반환할 수 있다.

| effect | 의미 |
| --- | --- |
| `append_user_message` | tool-generated user message row를 durable history에 추가한다. |
| `inline_appended_user_message` | 방금 추가한 user message의 image attachment를 다음 요청에 한 번 인라인한다. |

이 effect도 sessiondata append 순서를 따라야 하며 prompt 중간에 끼워 넣으면 안 된다.

## agent

`agent`는 별도 런타임이 아니라 중첩 session 생성 도구다. 호출 시
`AGENT.md`로 스캔된 `subagent_type`을 선택하고, 부모 tool call 아래에 child
session을 만든다. child session은 일반 session context reconstruction,
tool 실행, compact, interrupt 구조를 재사용한다.

부모 session interrupt는 active descendant session 전체로 전파된다.
`parentcontext`가 켜진 subagent는 부모 transcript 원문 대신 요약 row만 child
session 첫 요청 앞에 durable append한다.

## turnplan

`turnplan`은 별도 실행 엔진이 아니다. 현재 session의 기존 request queue에
일반 요청을 추가하거나 남은 항목을 수정/삭제하는 function tool이다.

`action=plan`은 하나의 목표와 여러 작업 요청을 받아 다음 형태로 큐에
넣는다.

```text
작업 A
성찰 요청
작업 B
성찰 요청
작업 C
목표 달성 요약 요청
```

성찰 요청과 요약 요청도 일반 turn으로 실행된다. 성찰 요청은 `$turnplan`
스킬을 호출하고, function tool의 `list`로 남은 큐를 조회한 뒤 모델이
세션 기록과 원래 목표를 비교해 큐 적합성을 판단한다. 필요하면 그 turn이
다시 `turnplan`의 `add`, `update`, `delete`, `clear`로 남은 큐를
재조정한다.
