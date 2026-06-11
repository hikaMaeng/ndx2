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
| `askUserQuestion` | 실행 중인 turn에서 연결된 브라우저에 질문을 보내고 첫 유효 응답을 tool result로 반환한다. |
| `session_history` | `sessionsearch`를 통해 이전 session 기록을 검색한다. |

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
