# rewriter marker와 session_history 사용법

`[[rewriter]]` marker와 `session_history`는 약한 local model이 긴 프로젝트 맥락을 더 안정적으로 다루게 돕는다. `[[rewriter]]`는 function tool이 아니라 `turn.request.received` system hook에서 처리되는 request marker다. `session_history`는 `packages/ndx/src/agent/tool/base/session_history`의 function tool이다.

## rewriter marker

웹클라이언트의 Rewrite 토글은 요청 마지막에 `[[rewriter]]`를 붙인다. 서버는 user row를 쓰기 전에 marker를 제거하고, 원문으로 `sessionsearch`를 직접 조회한 뒤 rewrite model을 호출한다. 최종 `sessiondata` user row에는 원문이 아니라 재작성된 prompt와 `세션 검색 보강 컨텍스트`가 저장된다.

전송 예:

```text
저번에 하던거 계속해
[[rewriter]]
```

rewriter 내부 model은 현재 세션 compact history와 direct sessionsearch 결과를 받는다. 현재 workspace 사실이 더 필요하면 `glob`, `grep_search`, `read_file`, `web_fetch`, `web_search`, `bash`만 호출할 수 있다. sessionsearch 보강은 model의 tool-call 판단에 맡기지 않는다.

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
| 사용자 요청이 너무 짧고 이전 맥락이 필요함 | `[[rewriter]]` |
| 특정 과거 논의나 결정 검색 | `session_history` |
| 같은 project 안의 이전 작업 근거 확인 | `session_history` project scope |
| raw prompt를 약한 모델용 절차로 바꾸기 | `[[rewriter]]` |
| 현재 repository 파일/코드 탐색 | `glob`, `grep_search`, `read_file`, `bash` |

rewriter와 `session_history`는 사용자의 의도를 확장하기 위한 기능이 아니다. 생략된 맥락을 복원하거나 실행 절차를 명확히 하되, 원래 scope를 키우면 안 된다.
