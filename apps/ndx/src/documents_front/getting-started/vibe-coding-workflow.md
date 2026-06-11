# 바이브코딩 작업 흐름

NDX의 바이브코딩 흐름은 "프롬프트를 던지고 결과를 믿는" 방식이 아니라, 요구사항, 증거 수집, 코드 변경, 검증, 문서 갱신을 한 turn 또는 여러 turn에 걸쳐 이어가는 방식이다.

## 권장 루프

| 순서 | 작업 | 에이전트가 확인해야 하는 증거 |
| --- | --- | --- |
| 1 | 요구사항 입력 | 사용자 요청, AGENTS.md, repo-local skills |
| 2 | 코드 위치 결정 | `docs/code-placement.md`, workspace imports |
| 3 | 현재 상태 조사 | `rg --files`, 관련 source/test/doc |
| 4 | 변경 | app/package 경계에 맞춘 최소 구현 |
| 5 | 검증 | 타입체크, 테스트, 브라우저 확인, 문서 링크 확인 |
| 6 | 기록 | durable docs와 test가 같은 계약을 설명하는지 확인 |

## 요청을 잘 쓰는 법

좋은 요청은 다음 정보를 포함한다.

| 포함 정보 | 이유 |
| --- | --- |
| 목표 화면 또는 기능 | 에이전트가 임의의 제품 흐름을 만들지 않게 한다. |
| 변경 허용 범위 | 기존 dirty worktree를 건드릴 때 충돌을 줄인다. |
| 검증 기준 | "완료"를 코드와 실행 결과로 판단할 수 있다. |
| 문서 갱신 필요 여부 | `docs/`와 앱 내 문서 사이트가 함께 갱신된다. |

## NDX가 특히 신경 쓰는 것

NDX는 복잡한 에이전트 시스템이기 때문에 기능 추가보다 경계 유지가 중요하다.

| 경계 | 유지 이유 |
| --- | --- |
| session server authority | 브라우저나 settings UI가 tool/inference 권한을 갖지 않도록 한다. |
| PostgreSQL source of truth | crash recovery와 cross-client continuity를 보장한다. |
| prefix-cache prompt shape | provider prefix cache 재사용과 context 일관성을 지킨다. |
| app/package 분리 | React/Express wiring과 domain invariant가 섞이지 않는다. |
| docs-as-contract | 구현 의도를 durable하게 남기고 회귀 검증 기준을 만든다. |

## 첨부와 이미지

이미지나 파일 첨부는 브라우저에서 세션 서버로 전달되지만 PostgreSQL에는 bytes가 저장되지 않는다. 서버가 프로젝트 하위 `.ndx/sessions/<sessionid>/`에 파일을 쓰고, `sessiondata`에는 path reference를 남긴다. 이미지는 필요한 다음 모델 요청에 한 번만 인라인되고 이후에는 durable path reference만 남는다.

이 정책은 비용과 prefix-cache 안정성을 동시에 지키기 위한 예외다.
