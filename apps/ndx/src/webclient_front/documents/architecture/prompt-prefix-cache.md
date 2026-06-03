# 프롬프트 prefix-cache 계약

NDX의 모델 요청은 provider prefix-cache 재사용을 보존해야 한다. cache hit는 단순 성능 문제가 아니라, turn 중 context ordering이 안정적이라는 증거이기도 하다.

## 모델에 보이는 순서

1. 안정적인 developer/system instructions
2. 안정적인 user instruction prelude와 environment context
3. PostgreSQL에서 재구성한 ordered append-only session history
4. 한 요청에만 붙는 attachment bytes 같은 one-request payload

다음 모델 요청은 의도적인 one-shot payload가 없는 한 이전 모델 요청 전체를 byte-for-byte prefix로 시작한 뒤 새 tool call, tool result, reminder, assistant/user history를 append해야 한다.

## 금지되는 변경

| 금지 | 이유 |
| --- | --- |
| history 앞에 새 message 삽입 | 이전 요청 prefix가 깨진다. |
| environment_context를 history 뒤로 이동 | stable prelude가 불안정해진다. |
| hook reminder를 임시 splice | DB order와 model-visible order가 달라진다. |
| fallback serialization rewrite | 다음 요청의 공통 prefix가 짧아진다. |

## 허용되는 예외

attachment bytes는 한 요청에만 payload로 붙을 수 있다. 이미지를 매번 다시 인라인하면 비용이 커지고 context가 불안정해진다. 그래서 durable history에는 path reference를 남기고, 필요한 다음 요청에만 image/file payload를 붙인 뒤 제거한다.

## 구현 체크포인트

| 변경 영역 | 확인할 파일 |
| --- | --- |
| context build | `packages/ndx/src/agent/context` |
| turn base message | `packages/ndx/src/agent/turnloop/base/context/index.ts` |
| sessiondata to model messages | `packages/ndx/src/agent/session/sessionDataRowsToModelMessages.ts` |
| attachment inline | `packages/ndx/src/agent/hook/turn.context.prepared/inlineInputImages.ts` |
| cot work reminder | `packages/ndx/src/agent/hook/turn.context.prepared/cotWorkReminder.ts` |
| prompt rewrite | `packages/ndx/src/agent/tool/execute/function/promptRewrite.ts` |

이 파일을 바꾸는 작업은 prompt ordering regression test를 함께 봐야 한다. 단순히 빌드가 통과했다고 완료가 아니다.
