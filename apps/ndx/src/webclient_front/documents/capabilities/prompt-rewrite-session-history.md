# prompt_rewrite와 session_history 사용법

`prompt_rewrite`와 `session_history`는 약한 local model이 긴 프로젝트 맥락을 더 안정적으로 다루게 돕는 function tool이다. 둘 다 `packages/ndx/src/agent/tool/execute/function`에 있고, tool result는 일반 tool continuation처럼 durable history에 남는다.

## prompt_rewrite

`prompt_rewrite`는 raw prompt를 실행 가능한 prompt로 재작성한다. 내부 loop는 최대 8 iteration이고, 허용 도구는 `glob`, `grep_search`, `read_file`, `web_fetch`, `web_search`, `bash`, `session_history`다. 현재 workspace 사실은 file/search/shell tool로 확인하고, `session_history`는 명시적 이전 session 참조나 필요한 과거 결정 확인에만 쓴다. 파일을 수정하는 도구는 허용되지 않는다.

입력 예:

```json
{
  "prompt": "저번에 하던거 계속해",
  "reason": "사용자 요청이 생략적이고 이전 세션 맥락이 필요하다."
}
```

출력 JSON은 다음 정보를 분리한다.

| key | 의미 |
| --- | --- |
| `original_prompt` | 원본 prompt. |
| `rewritten_prompt` | 실행용으로 명확해진 prompt. |
| `report` | 왜 그렇게 재작성했는지의 보고. |
| `tool_calls` | 내부 loop에서 사용한 도구 요약. |
| `facts` | 코드/문서/검색으로 확인한 사실. |
| `assumptions` | 아직 가정인 내용. |
| `ambiguities` | 사용자 확인이 필요한 모호점. |
| `should_ask_user` | 다음 단계에서 질문이 필요한지. |
| `pass_through` | 원문을 거의 그대로 써도 되는지. |

## session_history

`session_history`는 PostgreSQL `sessionsearch`를 조회한다. scope는 `all`, `project`, `session` 중 하나다.

입력 예:

```json
{
  "scope": "project",
  "query": "문서 사이트 coverage audit",
  "limit": 10
}
```

Project scope에서 `projectname`를 생략하면 현재 session의 project name를 사용한다. Session scope에서 `sessionid`를 생략하면 현재 session id를 사용한다.

## 언제 사용할까

| 상황 | 권장 도구 |
| --- | --- |
| 사용자 요청이 너무 짧고 이전 맥락이 필요함 | `prompt_rewrite` |
| 특정 과거 논의나 결정 검색 | `session_history` |
| 같은 project 안의 이전 작업 근거 확인 | `session_history` project scope |
| raw prompt를 약한 모델용 절차로 바꾸기 | `prompt_rewrite` |
| 현재 repository 파일/코드 탐색 | `glob`, `grep_search`, `read_file`, `bash` |

두 도구는 사용자의 의도를 확장하기 위한 도구가 아니다. 생략된 맥락을 복원하거나 실행 절차를 명확히 하되, 원래 scope를 키우면 안 된다.
