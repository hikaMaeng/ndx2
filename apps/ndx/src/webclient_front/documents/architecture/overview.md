# 전체 구조

NDX는 TypeScript + Turbo monorepo다. 하나의 deployable app인 `apps/ndx`가 Express 서버, webclient, admin front, Docker 런타임을 제공하고, product domain은 `packages/ndx`가 소유한다.

![NDX session runtime flow](../resources/session-runtime.svg)

## 최상위 구성

| 경로 | 역할 |
| --- | --- |
| `apps/ndx` | 배포 가능한 Express 서비스와 React UI composition. |
| `packages/ndx` | agent, webclient, admin, common domain contracts. |
| `pgvector` | Korean text search 지원 pgvector base image 소스. |
| `npm` | 최종 사용자용 Docker launcher 패키지. |
| `docs` | durable product/runtime/operator 문서. |
| `.codex/skills` | repo-local 작업 절차와 검증 가이드. |

## 앱 표면

| 표면 | 구현 |
| --- | --- |
| Web client | `apps/ndx/src/webclient_front` |
| Admin client | `apps/ndx/src/admin_front` |
| Express server | `apps/ndx/src/server` |
| Session socket wiring | `apps/ndx/src/server/agent` |
| Webclient HTTP API | `apps/ndx/src/server/web/webclient` |
| Admin HTTP API | `apps/ndx/src/server/web/admin` |
| Docker runtime | `apps/ndx/docker` |

## 패키지 표면

| export | 구현 |
| --- | --- |
| `ndx/common` | protocol, resource, log, response API, server path. |
| `ndx/agent` | account, project, session, turnloop, tools, hooks, context. |
| `ndx/webclient/common` | webclient DTO와 protocol. |
| `ndx/webclient/front` | browser-facing domain helper. |
| `ndx/webclient/server` | model/client-state persistence helper. |
| `ndx/admin/*` | admin domain contracts. |

## 설계 이유

NDX는 UI가 많은 앱처럼 보이지만 핵심 제품은 session runtime이다. 그래서 domain invariant를 React나 Express route 안에 넣지 않는다. 앱은 framework lifecycle과 transport만 담당하고, session truth와 agent execution은 package domain에 둔다.

이 구조는 다음 문제를 줄인다.

| 문제 | 방지 방식 |
| --- | --- |
| 웹 클라이언트가 agent loop를 소유함 | `apps/ndx/src/webclient_front`는 `ndx/agent`를 import하지 않는다. |
| socket transport가 state machine이 됨 | socket server는 protocol event fan-out만 맡는다. |
| DB와 memory state가 충돌함 | PostgreSQL row를 권위 상태로 둔다. |
| 문서가 코드와 어긋남 | 문서 사이트가 source map과 audit plan을 포함한다. |

## 빌드와 서빙

Vite는 webclient를 `apps/ndx/dist/webclient_front`로 빌드한다. Express는 production에서 이 정적 파일을 루트 경로로 제공하고 `/admin`은 별도 admin front를 제공한다. `/docs`는 webclient bundle 안의 문서 전용 React surface로 라우팅된다.
