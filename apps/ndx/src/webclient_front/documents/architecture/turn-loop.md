# 턴 루프

NDX의 coding session turn loop는 `packages/ndx/src/agent/turnloop`가 소유한다. 이 루프는 사용자 입력을 PostgreSQL에 기록하고, 모델 요청을 만들고, 도구 호출을 실행하고, 최종 assistant row를 append하는 실행 절차다. WebSocket 서버는 이 절차를 호출하고 이벤트를 전달하지만 루프의 상태 기계 자체를 소유하지 않는다.

## 실행 순서

| 단계 | 코드 책임 | 설명 |
| --- | --- | --- |
| start turn | `updateSessionStartTurn` | `session.isrunning`, `turnphase`, interrupt 상태를 갱신한다. |
| request hook | `runTurnRequestReceivedHook` | 입력을 받은 직후 request text를 검토하거나 stop-turn/compact를 만들 수 있다. |
| user row append | `appendSessionData(..., "user", userMessageContents(...))` | 모델-visible user request를 durable history에 기록한다. |
| base message build | `buildTurnBaseMessageParts` | stable developer/user prelude와 environment context를 만든다. |
| history rebuild | `listSessionData` + `sessionDataRowsToModelMessages` | 매 iteration마다 PostgreSQL history를 다시 읽는다. |
| context hook | `runTurnContextPreparedHook` | model request 직전 message/tool schema를 조정할 수 있다. |
| model request | `requestModelResponse` | Responses API 호환 provider에 stream request를 보낸다. |
| tool call append | `toolCallContents` | model이 요청한 tool call을 durable row로 기록한다. |
| tool execution | `executeToolCalls` | process/function tool을 실행하고 progress event를 낸다. |
| tool result append | `toolResultContents` | tool output을 durable row로 기록한다. |
| final response | `assistantMessageContents` | 최종 사용자 답변을 기록하고 turn을 종료한다. |
| turn end hook | `runTurnEndHook` | session search와 turn context usage 같은 최종 후처리를 실행한다. |

## 반복과 종료

루프는 모델이 tool call을 내는 동안 반복된다. `runtime.maxModelIterations`를 넘으면 일반 실패로 멈추지 않고, 도구 없는 마지막 모델 요청을 보내 사용자에게 현재 상태와 한계를 요약하게 한다. 이 정책은 장시간 바이브코딩에서 무한 루프를 그대로 사용자에게 던지지 않기 위한 완충 장치다.

## interruption

`beginTurnInterruptScope`는 turn phase별 checkpoint를 제공한다. 모델 요청, 도구 실행, client function tool이 실행 중이면 abort signal을 통해 중단 요청을 전달한다. 중단은 단순히 UI에서 버튼을 비활성화하는 동작이 아니다. session row의 interrupt flag와 phase, tool result, 최종 row가 함께 일관되게 기록되어야 한다.

## context usage

`calculateDetailedContextUsage`는 현재 model messages, tool schema, in-flight assistant text를 기준으로 context 사용량을 계산한다. 이 값은 UI progress와 runtime 판단 모두에 쓰이므로, 브라우저가 추정하지 않고 turn loop에서 나온 event를 표시한다.

## 설계 이유

Turn loop가 매 iteration마다 PostgreSQL에서 history를 다시 읽는 이유는 하나다. 실행 중 memory가 편하더라도 authoritative state가 되면 crash recovery와 prefix-cache 계약이 깨진다. `packages/ndx/src/agent/turnloop/messages.ts`는 developer, user prelude, history, inline attachment 순서를 고정하고, `runAgentTurn`은 그 순서를 반복해서 사용한다.
