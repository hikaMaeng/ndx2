# 스킬 시스템

스킬은 특정 작업 절차를 `SKILL.md`로 보존하는 경량 지식 단위다. NDX는 모델이 매번 모든 세부 절차를 기억하는 대신, 필요한 순간에 해당 skill body를 읽도록 설계한다.

## 스킬 위치

| 범위 | 예시 위치 |
| --- | --- |
| repository-local | `.codex/skills/<skill>/SKILL.md` |
| scaffolded assets | `packages/ndx/src/agent/init/assets/skills` |
| system assets | `packages/ndx/src/agent/init/assets/system/skills` |
| project runtime | `<projectHome>/.ndx/skills` |
| user runtime | `<userHome>/.ndx/skills` |

## 현재 repo-local 스킬

| 스킬 | 문서화해야 하는 계약 |
| --- | --- |
| `monorepo-architecture-guard` | workspace/package/app boundary, Yarn PnP, Turbo, Express/React/shadcn 기준. |
| `docker-compose-module-design` | compose, Dockerfile, container ownership, deploy entrypoint. |
| `headless-browser-test` | browser smoke/E2E와 locator contract. |
| `package-docs-writer` | package README/docs 구조와 문서 작성 규칙. |
| `agenttest` | JSON suite 기반 agent test/report. |
| `web-deploy-docker` | explicit deploy script workflow. |
| `react-decoupled-frontend` | React composition과 state coupling 제어. |

## 사용 원칙

스킬은 prompt에 상시로 모두 붙이면 안 된다. 필요한 스킬의 `SKILL.md`를 읽고, 그 파일이 지정한 reference나 script만 추가로 로딩한다. 이렇게 해야 context 비용을 줄이고, 작업별 지침이 섞이는 문제를 줄일 수 있다.

## 문서 사이트와의 관계

이 문서 사이트는 사용자가 읽는 product/operator 문서다. 스킬은 에이전트가 작업할 때 따르는 절차다. 둘은 중복되면 안 된다.

| 문서 사이트 | 스킬 |
| --- | --- |
| 제품 구조와 사용법 설명 | 작업 절차와 검증 루틴 |
| 사용자/운영자 대상 | 에이전트 작업자 대상 |
| Markdown으로 렌더링 | `SKILL.md`로 필요 시 로딩 |
| 장기 계약과 source map | 실행 순서와 체크리스트 |
