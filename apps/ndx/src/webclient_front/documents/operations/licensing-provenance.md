# 라이선스와 Provenance

루트 `docs/licensing.md`는 이 저장소의 license contract를 정의한다. 현재 프로젝트 license는 아직 선택되지 않았다. 따라서 문서, 코드, UI 어디에서도 이 저장소 자체가 Apache-2.0이라고 말하면 안 된다.

## 기본 규칙

| 규칙 | 의미 |
| --- | --- |
| project license undecided | repository license를 특정하지 않는다. |
| upstream notice 보존 | 복사/각색한 외부 code/text/design/config의 required notice를 제거하지 않는다. |
| provenance 기록 | 외부 출처를 durable docs나 관련 코드 근처에 기록한다. |
| LICENSE 추가 금지 | 명시 license 결정 전에는 project LICENSE 파일을 만들지 않는다. |

## OpenAI Codex와의 관계

NDX는 open-source OpenAI Codex agent에서 영감을 받은 새 coding agent지만 mechanical port가 아니다. OpenAI Codex source는 Apache-2.0 licensed다. 그 upstream에서 code, text, design을 복사하거나 각색하면 Apache-2.0 notice와 provenance를 보존해야 한다.

영감이나 behavior reference만 있는 경우에도 source-level copy와 구분해 기록해야 한다. 예를 들어 "provider behavior를 참고했다"와 "소스 코드를 가져왔다"는 license risk가 다르다.

## 문서 작성 기준

앱 내 문서가 외부 프로젝트를 언급할 때는 다음을 지킨다.

| 상황 | 문서화 방식 |
| --- | --- |
| source copy/adaptation | required notice와 파일/commit/source provenance를 남긴다. |
| behavior reference | source copy가 아님을 분리해 설명한다. |
| dependency usage | package license는 dependency manifest와 release review에서 확인한다. |
| uncertain provenance | 완료로 표시하지 않고 확인 필요 항목으로 둔다. |

## 설계 이유

에이전트 프로젝트는 prompt, tool schema, UI pattern, provider compatibility code가 쉽게 섞인다. License provenance를 나중에 복원하려고 하면 사실상 불가능하다. 그래서 외부 source를 가져오는 순간 durable docs에 남기는 정책을 둔다.
