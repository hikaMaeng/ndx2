# 컨텍스트 조립

NDX의 컨텍스트 조립은 `packages/ndx/src/agent/context`와 `packages/ndx/src/agent/turnloop/base/context/index.ts`가 함께 담당한다. 목표는 모든 model request가 같은 stable prelude에서 시작하고, PostgreSQL history가 append-only 순서로 붙도록 만드는 것이다.

## context parts

| part | 코드 | 모델 역할 |
| --- | --- | --- |
| developer | `buildContextParts().developer` | model instruction, developer instruction, skills/plugins. |
| userInstructions | `buildUserInstructions` | AGENTS.md, project/user instruction, repository-local guidance. |
| environment | `buildEnvironmentContext` | `cwd`, shell, date/timezone 같은 stable environment context. |
| history | `sessionDataRowsToModelMessages` | PostgreSQL `sessiondata`에서 온 ordered history. |
| inlineAttachments | `sessionDataRowsToInlineAttachmentMessages` | 다음 요청에 한 번만 붙는 image/file payload. |

## stable prelude

`buildTurnBaseMessageParts`는 먼저 developer system message와 user prelude message를 만든다. 여기에는 `environment_context`가 history 앞에 들어간다. 이 위치가 중요한 이유는 provider prefix-cache가 이전 request 전체를 prefix로 재사용해야 하기 때문이다.

## instruction sources

| source | 설명 |
| --- | --- |
| model instruction | 모델별 instruction resolver가 만든 기본 지침. |
| developer instruction | NDX agent personality와 작업 방식. |
| available skills | 현재 user/project/runtime에서 발견된 skill 요약. |
| available plugins | 사용 가능한 plugin 안내. |
| user instructions | AGENTS.md와 사용자/프로젝트 지침. |

## 날짜와 환경

`buildEnvironmentContext`는 `cwd`, `shell`, 선택적인 `currentDate`, `timezone`만 넣는 작고 안정적인 XML-like block을 만든다. environment가 작아야 하는 이유는 매 요청마다 바뀌는 임시 상태가 stable prefix 안에 들어가면 prefix-cache가 흔들리기 때문이다.

## 변경 시 회귀 위험

다음 파일을 바꾸면 prompt ordering 회귀 테스트를 확인해야 한다.

| 파일 | 위험 |
| --- | --- |
| `packages/ndx/src/agent/context/index.ts` | developer/user/environment prelude 순서 변경. |
| `packages/ndx/src/agent/turnloop/base/context/index.ts` | model request message order 변경. |
| `packages/ndx/src/agent/session/sessionDataRowsToModelMessages.ts` | durable history serialization 변경. |
| `packages/ndx/src/agent/hook/turn.context.prepared/index.ts` | `turn.context.prepared` system hook 묶음(아래 구현 import) 변경. |
| `packages/ndx/src/agent/hook/base/inlineInputImages/index.ts` | inline attachment append 위치 변경. |
| `packages/ndx/src/agent/tool/base/cot_work/reminderHook.ts` | cot work reminder append 위치 변경. |

컨텍스트 조립은 단순 prompt 문자열 합치기가 아니다. NDX에서는 세션 복구, tool continuation, prefix-cache, attachment 비용 최적화가 모두 이 순서에 묶여 있다.
