# Repository Docs 맵

앱 내 문서 사이트는 사용자가 탐색하는 제품 문서이고, 루트 `docs/`는 durable repository contract다. 두 위치는 경쟁하지 않는다. 루트 문서는 구현자가 따라야 하는 원본 계약을 보존하고, 앱 내 문서는 그 계약을 사용자/운영자/개발자 관점으로 다시 엮어 보여준다.

## 루트 문서 목록

| 루트 문서 | 앱 문서에서 다루는 주제 |
| --- | --- |
| `docs/accounts.md` | 기본 `ndev` account, account identity, deletion cascade. |
| `docs/api.md` | HTTP/WebSocket surface, session event, history restore. |
| `docs/architecture.md` | TypeScript monorepo, agent server authority, PostgreSQL source of truth. |
| `docs/code-placement.md` | app/package boundary, agent/webclient/settings/documents placement. |
| `docs/constraints.md` | product, UI, PostgreSQL, package manager constraints. |
| `docs/internals.md` | task turn, durable event category, root workspace internals. |
| `docs/licensing.md` | undecided repository license and upstream provenance rules. |
| `docs/npm-release.md` | npm Docker launcher and GHCR release order. |
| `docs/overview.md` | repository overview. |
| `docs/runtime-control.md` | idle, interrupt, queued work, interjection, hook events. |
| `docs/runtime-volume.md` | `/ndx` volume, path mapping, runtime directories. |
| `docs/session-data.md` | PostgreSQL-backed session reconstruction and sessionsearch. |
| `docs/sessions.md` | session identity, grants, skill mentions, chat sessions. |
| `docs/testing.md` | repository test expectations and browser-test contracts. |
| `docs/usage.md` | local commands, npm launcher, DB access, runtime assumptions. |
| `docs/web-tools.md` | `web_fetch` and `web_search` provider behavior. |

## 역할 분리

| 위치 | 역할 |
| --- | --- |
| `docs/` | 구현 변경과 함께 유지되는 durable contract. |
| `apps/ndx/docs` | app-local API, UI locator, deployment, testing contract. |
| `packages/ndx/docs` | package export/API/constraints/testing contract. |
| `apps/ndx/src/documents_front` | browser에서 보는 문서 사이트와 coverage audit. |

## 감사 정책

`yarn workspace ndx-app docs:audit`는 루트 `docs/*.md` 파일이 앱 내 Markdown 문서에서 경로 그대로 언급되는지 검사한다. 새 루트 문서가 추가되면 이 문서를 갱신하지 않는 한 감사가 실패해야 한다.

이 정책은 앱 문서가 루트 문서와 어긋나는 것을 완전히 막지는 못한다. 하지만 최소한 "새 durable contract가 생겼는데 문서 사이트에서 찾을 수 없음" 상태는 코드로 잡는다.
