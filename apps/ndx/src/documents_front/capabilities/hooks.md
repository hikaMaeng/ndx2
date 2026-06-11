# 턴 훅

Hook runtime은 turn loop 중 특정 시점에 system hook과 `.ndx` hook을 실행한다. hook은 request text, model messages, tool calls, tool results, final response에 영향을 줄 수 있으므로 prompt-cache 계약과 직접 연결된다.

## 지원 이벤트

| 이벤트 | 시점 |
| --- | --- |
| `turn.request.received` | 사용자 요청이 accept된 직후. |
| `turn.context.prepared` | model messages/tools/context usage가 준비된 직후. |
| `turn.model.request` | model request 직전, 직전 요청 대비 stable prefix drift를 감사할 때. |
| `turn.model.responding` | model stream 중 text/reasoning/tool_call이 도착할 때. |
| `turn.tool.called` | model이 tool calls를 요청한 뒤 실행 전. |
| `turn.tool.results.collected` | requested tools가 끝나고 결과 기록 전. |
| `turn.end` | final assistant/error row가 기록된 뒤. |

`turn.model.progress`는 hook event가 아니다. Model request가 계속 pending인
동안 turn loop가 120초마다 socket-only 진행 알림으로 보낸다.

## effect

| effect field | 의미 |
| --- | --- |
| `replaceRequestText` | request text를 교체한다. |
| `replaceMessages` | model input 전체를 교체한다. 매우 조심해야 한다. |
| `appendMessages` | model input 끝에 message를 추가한다. |
| `replaceModelTools` | model에 제공할 tool schema를 바꾼다. |
| `replaceToolCalls` | 실행할 tool call 목록을 바꾼다. |
| `replaceToolResults` | model에 돌아갈 tool result를 바꾼다. |
| `finalAssistantText` | turn을 user-facing 답변으로 종료할 수 있다. |
| `interruptModelResponse` | streaming model response를 중단한다. |

## 내장 system hook 예시

| 영역 | 역할 |
| --- | --- |
| skill marker | 요청에서 skill trigger를 감지하고 context에 반영한다. |
| inline input images | `runtimedata.inlineAttachmentDataIds`에 지정된 이미지를 한 요청에 인라인한다. |
| cot work reminder | 장시간 작업 중 cot work 사용 reminder를 추가한다. |
| prefix drift audit | `turn.model.request`에서 직전 model request의 stable prefix가 깨졌는지 진단한다. |
| stream guard | reasoning이 너무 길어지면 model stream을 중단한다. |
| loop detection | tool-heavy loop가 반복되는지 확인한다. |
| session search | turn end에서 user/final assistant row를 `sessionsearch`에 반영한다. |
| turn context usage | turn end에서 평균 턴 토큰 사용량을 갱신한다. |

## hook 작성 주의

Hook은 기능을 쉽게 확장하지만, 잘못 쓰면 context ordering을 깨뜨린다. model-visible 내용을 만들면 sessiondata append position과 일치해야 한다. 임시로 history 중간에 끼워 넣는 hook은 금지다.
