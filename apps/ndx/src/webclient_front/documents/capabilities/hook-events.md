# Hook 이벤트 상세

Hook runtime은 `packages/ndx/src/agent/hook`가 소유한다. Hook은 turn loop 내부 특정 지점에서 실행되며, request text, model messages, tool calls, tool results, final response에 영향을 줄 수 있다.

## 이벤트 목록

| 이벤트 | 실행 시점 | 대표 effect |
| --- | --- | --- |
| `turn.request.received` | user request accept 직후 | `replaceRequestText`, `finalAssistantText`, `stopTurn` |
| `turn.context.prepared` | model request 직전 | `appendMessages`, `replaceMessages`, `replaceModelTools` |
| `turn.model.responding` | model stream 중 | `interruptModelResponse`, `interruptReason` |
| `turn.tool.called` | tool execution 직전 | `replaceToolCalls`, `finalAssistantText` |
| `turn.tool.results.collected` | tool 결과 수집 후 기록 전 | `replaceToolResults`, `stopTurn` |
| `turn.end` | final assistant/error row 기록 후 | 후처리 system hook |

Hook event surface는 test에서 고정되어 있다. turn loop 내부 구현 세부사항마다 hook을 추가하지 않고, durable turn interception point만 노출한다.

## system hook plan

`systemNDXHookPlan`은 이벤트별 built-in hook 배열을 만든다.

| 이벤트 | system hook |
| --- | --- |
| request received | skill marker, context limit |
| context prepared | cot work reminder, inline input images, context limit |
| model responding | stream guard |
| tool results collected | loop detection |
| turn end | session search, turn context usage |

Project/user/plugin hook은 `.ndx/hook/hook.json` 또는 plugin hook plan에서 추가된다. Load order는 global hook, user plugin hook, project hook, project plugin hook 순서로 append된다.

## effect merge

Hook executor는 같은 event 안에서 순차 실행된다. 앞 hook이 append한 message는 다음 hook context에 반영된다. `stopturn` effect가 나오면 같은 event의 뒤 hook은 실행되지 않는다. replace 계열 effect는 나중 effect가 이전 값을 덮고, append 계열은 누적된다.

## prompt-cache 주의

`turn.context.prepared`에서 `appendMessages`를 쓰는 hook은 모델 요청 끝에 붙는 message를 만들 수 있다. 그러나 durable model-visible row를 만들어야 하는 hook은 sessiondata append position과 일치해야 한다. Hook이 history 중간에 임시 message를 splice하면 provider prefix-cache 계약을 깨뜨린다.

## process hook

Project/user hook은 process executor로 실행될 수 있다. Process hook은 tool process와 비슷하게 command/args/stdin/cwd/timeout을 갖고, stdout result에서 hook effect를 파싱한다. Process hook의 cwd 기본값은 project home이다.

Hook은 강력한 확장점이지만 runtime control plane이다. 일반 기능 추가를 hook으로 숨기기보다, turn lifecycle의 특정 지점에서 필요한 정책만 hook으로 분리해야 한다.
