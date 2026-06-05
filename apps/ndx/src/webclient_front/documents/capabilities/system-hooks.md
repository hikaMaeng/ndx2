# System Hook 동작

System hook은 NDX runtime이 기본으로 설치하는 hook이다. 사용자가 `.ndx/hook/hook.json`을 만들지 않아도 실행되며, skill marker, cot work reminder, inline image, prefix drift audit, stream guard, loop detection, session search 같은 핵심 보조 정책을 담당한다. 이벤트별 system hook 묶음은 `packages/ndx/src/agent/hook/system.ts`의 `systemNDXHookPlan`이 정의한다.

## skill marker

`turn.request.received`의 skill marker hook은 사용자 입력에서 skill trigger를 감지한다. Composer는 `$skill` mention을 `[[NDX_SKILL___id__]]` markup으로 넣고, hook/context builder는 이를 실제 skill loading 흐름과 연결한다. Hook은 selected-skill instruction을 `skill_context` row로 저장하고, 필요한 경우 normal `loadSkill` base tool을 실행해 얻은 `<skill>...</skill>` output도 같은 row에 넣는다. 모델에는 user-role context message로 노출한다. 선행 model tool call이 없는 preload이므로 `function_call_output`으로 만들지 않는다.

## session search hooks

`turn.end`에는 session search hook이 있다. 이 hook은 최종 assistant/error row가 append된 뒤 user row와 final assistant row를 `sessionsearch`에 projection한다. reasoning/tool result 전체는 넣지 않는다.

## turn context usage

`turn.end`의 turn context usage hook은 한 턴의 user row부터 final assistant/error row까지 사용한 토큰량을 집계해 `turncontextusage`를 갱신한다. 이 후처리는 모델 스트리밍 중 실행하지 않는다.

## cot work reminder

`turn.context.prepared`의 `cot_work_reminder`는 현재 turn 안에 미완료 `cot_work`가 있으면 다음 model request 끝에 reminder message를 append한다. 동시에 `cot_work_reminder` sessiondata row를 append해서 같은 iteration에 같은 reminder가 중복 삽입되지 않게 한다.

Reminder는 다음 내용을 포함한다.

| 내용 | 목적 |
| --- | --- |
| active plan step list | 모델이 현재 계획을 잊지 않게 한다. |
| stale/completed/blocked update 지시 | 계획 상태를 실제 진행과 맞춘다. |
| reason | mid-task plan 변경 이유를 유지한다. |

## inline input images

`turn.context.prepared`의 inline image hook은 `session.runtimedata.inlineAttachmentDataIds`에 있는 sessiondata row의 image attachment를 다음 request에 한 번만 base64 image payload로 붙인다. 처리 후 runtime data에서 id를 제거해 다음 request의 prefix를 안정화한다.

## prefix drift audit

`turn.model.request`의 prefix drift audit hook(`packages/ndx/src/agent/hook/base/prefixDrift/index.ts`)은 최종 model request 직전에 직전 요청 message와 이번 요청 message의 stable prefix를 비교한다. prefix가 제거되거나 바뀌면 `prefixDrifts`와 진단 메시지를 effect로 반환한다. 이 hook은 model-visible 내용을 바꾸지 않고, prefix-cache 계약 위반을 런타임에서 감지·기록하는 감사 장치다. prefix-cache 문서가 설명하는 "byte-for-byte prefix" 규칙을 코드로 지키는 지점이다.

## stream guard

`turn.model.responding`의 StreamGuard hook은 assistant output text가 나오기 전에 reasoning summary가 너무 길어지면 active model response를 interrupt한다. 제한값은 `/ndx/.ndx/settings.json`의 `hooks.StreamGuard.MAX_REASONING_LENGTH`를 우선 사용하고, 값이 없거나 잘못되면 `240000` characters를 fallback으로 쓴다.

## loop detection

`turn.tool.results.collected`의 loop detection hook은 `runtime.loopDetectionInterval`마다 실행된다. 최근 iteration window의 sessiondata와 현재 tool calls/results를 모델에게 judge payload로 보내고, `{ shouldStop, reason, finalAssistantText }` JSON을 받는다. `shouldStop`이 true면 hook이 `stopturn` effect를 반환해 turn을 사용자-facing message로 끝낸다.

Loop detection은 iteration 번호가 높다는 이유만으로 멈추지 않는다. 같은 tool failure나 같은 repair path를 새 증거 없이 반복하는지를 판단한다.
