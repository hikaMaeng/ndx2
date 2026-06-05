# 함수 도구 상세

Function tool은 process를 spawn하지 않고 TypeScript 함수로 실행되는 도구다. 구현은 `packages/ndx/src/agent/tool/base`의 `askUserQuestion`, `prompt_rewrite`, `session_history` 디렉터리에 있고, `packages/ndx/src/agent/tool/base/functionTools.ts`가 이를 `NDX_BUILTIN_FUNCTION_TOOLS`로 모은다. registry는 이 도구들을 builtin tool처럼 model tool schema에 포함한다.

## askUserQuestion

`askUserQuestion`은 연결된 browser client에 질문을 보내고 응답을 tool result로 반환한다.

| 항목 | 계약 |
| --- | --- |
| 질문 수 | 1개 이상 3개 이하. |
| id | unique snake_case. |
| inputType | `single_choice`, `free_text`, `secret`. |
| single choice | option 2개 이상 4개 이하. |
| client bridge | active session client bridge와 tool call id가 필수. |

응답에 attachment가 있으면 user home 아래 `.ndx/runtime/askUserQuestion/<session>/<call>/<question>/`에 파일을 쓰고, `append_user_message`와 `inline_appended_user_message` effect를 반환한다. 이 effect는 turn loop가 durable row로 append한 뒤 다음 request에서 한 번만 inline해야 한다.

## prompt_rewrite

`prompt_rewrite`는 raw user prompt를 더 실행 가능한 prompt로 바꾸는 internal loop다. active model 설정을 기본으로 쓰되, `/ndx/.ndx/settings.json`의 `tools.prompt_rewrite.model`이 있으면 model name만 바꾼다. 이 도구는 compact history와 허용된 read/search tool을 사용할 수 있지만, 결과는 하나의 function tool result로 main turn history에 들어간다.

## session_history

`session_history`는 `sessionsearch`를 조회하는 function tool이다. scope는 all/project/session으로 좁힐 수 있고, query가 있으면 vector 또는 FTS 검색으로 ranking한다. 이 도구가 별도 memory store를 만들면 안 된다. 검색 대상은 PostgreSQL projection이어야 한다.

## process tool과 다른 점

| 구분 | process tool | function tool |
| --- | --- | --- |
| 실행 방식 | shell command spawn | TypeScript function call |
| schema 위치 | `tool.json` | exported schema function |
| client interaction | 직접 불가 | session client bridge 가능 |
| cancellation | process signal | abort signal과 bridge close |
| 권한 판단 | registry/allowlist/process env | executor option과 domain function |

Function tool은 편하지만 agent runtime 안에서 실행되므로 prompt ordering과 durable history 규칙을 더 엄격하게 지켜야 한다.
