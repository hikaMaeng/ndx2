# 문서화 절차 계획

전체 목표는 사용법, 아키텍처, 도구/스킬/훅, 운영/검증을 실제 코드와 맞물리게 문서화하는 것이다. 이 계획은 한 번에 끝내는 체크리스트가 아니라 source coverage scanner와 함께 계속 갱신되는 백로그다.

## Phase 1: 문서 사이트 기반

| 번호 | 작업 | 완료 조건 |
| --- | --- | --- |
| 1 | `documents` root 생성 | catalog와 전용 React renderer가 있다. |
| 2 | 좌측 문서 메뉴 | category/doc title이 좌측에 표시된다. |
| 3 | Markdown 렌더링 | md가 `react-markdown`으로 렌더링된다. |
| 4 | 검정 배경 dark theme | docs surface가 black base theme을 사용한다. |
| 5 | 앱 좌상단 링크 | main app에서 `/docs`가 새 탭으로 열린다. |
| 6 | subfolder md 배치 | category별 md가 하위 폴더에 있다. |

## Phase 2: 사용자 문서

| 번호 | 작업 | 완료 조건 |
| --- | --- | --- |
| 7 | npm 설치 문서 | npm launcher와 Docker 전제 조건 설명. |
| 8 | 첫 실행 문서 | URL, 모델 설정, 프로젝트 선택 설명. |
| 9 | 첫 세션 문서 | session 생성과 default account 설명. |
| 10 | composer 문서 | text/image/file attachment 흐름 설명. |
| 11 | 다중 클라이언트 문서 | history replay와 duplicate event 처리 설명. |
| 12 | 장애 해결 문서 | Docker, DB, model provider, socket 오류 분류. |
| 12.1 | webclient UI 문서 | menu, session surface, right sidebar, landing 흐름 설명. |
| 12.2 | model provider 설정 문서 | provider/model/modality/context size 설정 설명. |

## Phase 3: 아키텍처 문서

| 번호 | 작업 | 완료 조건 |
| --- | --- | --- |
| 13 | monorepo boundary | apps/packages/import 규칙 설명. |
| 14 | session server authority | webclient/admin/CLI가 agent loop를 소유하지 않음을 설명. |
| 15 | PostgreSQL schema | project/session/sessiondata/sessionsearch/chat tables 설명. |
| 16 | context reconstruction | stable prelude/history/attachment ordering 설명. |
| 17 | prefix-cache contract | byte-for-byte prefix 요구와 예외 설명. |
| 18 | path mapping | host/container/workspace/user home path 설명. |
| 19 | logging | web/agent/session log 위치와 JSONL policy 설명. |
| 19.1 | turn loop deep dive | `packages/ndx/src/agent/turnloop` 실행 순서와 interruption 설명. |
| 19.2 | response API deep dive | `packages/ndx/src/common/responseapi` provider 호환 계층 설명. |
| 19.3 | session socket deep dive | `apps/ndx/src/server/agent` WebSocket grant/event fan-out 설명. |
| 19.4 | session schema/search deep dive | `packages/ndx/src/agent/session/schema.ts`와 `sessionSearch.ts` 설명. |
| 19.5 | webclient API deep dive | `apps/ndx/src/server/web/webclient` route group 설명. |
| 19.6 | server path mapping | `packages/ndx/src/common/server-path` host/container 변환 설명. |
| 19.7 | protocol message spec | `packages/ndx/src/common/protocol` message validator 설명. |
| 19.8 | admin surface boundary | `apps/ndx/src/admin_front`와 `packages/ndx/src/admin` 경계 설명. |

## Phase 4: 기능 문서

| 번호 | 작업 | 완료 조건 |
| --- | --- | --- |
| 20 | tool registry | user/project/builtin/plugin tool load order 설명. |
| 21 | process tools | tool.json, command, args, env, stdin 설명. |
| 22 | function tools | askUserQuestion, prompt_rewrite, session_history 설명. |
| 23 | tool effects | append_user_message와 inline effect 설명. |
| 24 | skills | skill trigger/loading/context budget 설명. |
| 25 | hooks | event/effect/stop-turn/ordering 설명. |
| 26 | chat mode | project coding session과 chat session 차이 설명. |
| 27 | browser tools | web_search/web_fetch/getImage 권한과 제한 설명. |
| 27.1 | chat tool allowlist | `packages/ndx/src/agent/chat/tool/policy.ts` mutation 금지 설명. |
| 27.2 | base-tools reference | `packages/ndx/src/agent/tool/base/*/tool.json` 입력과 사용 기준 설명. |
| 27.3 | system hooks reference | built-in hook별 runtime effect와 설정 설명. |
| 27.4 | prompt rewrite examples | `prompt_rewrite`와 `session_history` 입력/출력 예시 설명. |

## Phase 5: 운영 문서

| 번호 | 작업 | 완료 조건 |
| --- | --- | --- |
| 28 | Docker image | agent image와 pgvector base image 설명. |
| 29 | pgvector publish | GHCR publish script와 tag 정책 설명. |
| 30 | npm release | npm launcher와 template compose 설명. |
| 30.1 | pgvector publish | `pgvector/publish-ghcr.sh` multiarch publish 절차 설명. |
| 31 | deploy script | deploy-report block 기준 설명. |
| 32 | environment | env var source와 schema validation 설명. |
| 33 | data backup | `/ndx/pgvector`, `.ndx`, workspace 분리 설명. |
| 33.1 | root docs cross reference | `docs/*.md`가 앱 문서 사이트에서 모두 경로로 연결된다. |
| 33.2 | licensing provenance | `docs/licensing.md` 정책과 upstream notice 규칙 설명. |
| 33.3 | account lifecycle | `docs/accounts.md` default account와 deletion cascade 설명. |

## Phase 6: 코드 검수 자동화

| 번호 | 작업 | 완료 조건 |
| --- | --- | --- |
| 34 | source coverage scanner | source map category가 자동 생성된다. |
| 35 | doc manifest schema | `documents/coverage.json`과 `documents/catalog.ts`가 required metadata를 가진다. |
| 36 | Markdown link checker | broken internal link를 잡는다. |
| 37 | route smoke | `/docs`와 대표 doc route가 browser에서 통과한다. |
| 38 | import boundary check | apps/packages 금지 import를 검사한다. |
| 39 | prompt ordering tests | context reconstruction 변경 회귀를 잡는다. |
| 40 | docs CI gate | 문서 누락이 test failure로 드러난다. |

## Phase 7: 완료 감사

| 번호 | 작업 | 완료 조건 |
| --- | --- | --- |
| 41 | apps coverage audit | `apps/ndx`의 server/front/docker/assets 문서가 모두 연결된다. |
| 42 | packages coverage audit | `packages/ndx/src`의 exported domain이 모두 연결된다. |
| 43 | root ops coverage audit | Docker, pgvector, npm, scripts, Turbo/Yarn 문서가 연결된다. |
| 44 | user journey audit | 설치부터 첫 PR 수준 작업까지 문서만 보고 진행 가능하다. |
| 45 | architecture audit | 왜 그렇게 구성했는지 path별 rationale이 있다. |
| 46 | capability audit | 각 도구/스킬/훅의 사용법과 제한이 있다. |
| 47 | Korean-first audit | 기본 문서와 UI label이 한국어 기준이다. |
| 48 | final evidence report | completion claim 전에 command output과 coverage report를 남긴다. |

현재 단계는 Phase 1의 기반과 Phase 2-5의 핵심 초안이다. 최종 완료에는 Phase 6 자동화와 Phase 7 감사가 필요하다.
