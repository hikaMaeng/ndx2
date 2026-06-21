# 소스 맵

이 문서는 문서화가 빠뜨리면 안 되는 코드 표면의 색인이다. 새 폴더나 runtime surface가 추가되면 이 문서도 갱신해야 한다.

## apps

| 경로 | 문서화 주제 |
| --- | --- |
| `apps/ndx/src/server/app.ts` | Express wiring, static serving, health, API attachment. |
| `apps/ndx/src/server/index.ts` | process startup, DB init, HTTP server, WebSocket attach, shutdown. |
| `apps/ndx/src/server/agent` | session socket transport, history replay, project negotiation. |
| `apps/ndx/src/server/web/webclient` | webclient API routes for metadata, projects, sessions, chat, workspace. |
| `apps/ndx/src/server/web/webclient/settings` | settings HTTP orchestration that delegates product rules to `packages/ndx`. |
| `apps/ndx/src/webclient_front` | browser app shell, session UI, menu, chat, modal, settings. |
| `apps/ndx/src/documents_front` | separate document site bundle served under `/docs`. |
| `apps/ndx/assets/i18n` | bundled runtime UI/server resource strings. |
| `apps/ndx/docker` | runtime image, env, entrypoint. |

## packages

| 경로 | 문서화 주제 |
| --- | --- |
| `packages/ndx/src/agent/project` | project identity and path normalization. |
| `packages/ndx/src/agent/session` | PostgreSQL session tables, append/list/update, reconstruction. |
| `packages/ndx/src/agent/turnloop` | turn execution, interruption, model/tool iteration. |
| `packages/ndx/src/agent/tool` | registry, tool process/function execution, effects. |
| `packages/ndx/src/agent/hook` | hook plan loading, event execution, effect merging. |
| `packages/ndx/src/agent/context` | developer/user/environment prompt prelude. |
| `packages/ndx/src/agent/chat` | project-independent chat folder/session/runtime. |
| `packages/ndx/src/common/protocol` | socket/API protocol contracts. |
| `packages/ndx/src/common/responseapi` | model provider request/response abstraction. |
| `packages/ndx/src/common/server-path` | host/container path mapping. |
| `packages/ndx/src/webclient` | webclient DTO, front helpers, server persistence helpers. |
| `packages/ndx/src/webclient/server/settings` | settings domain logic backed by `.ndx/settings.json`. |

## root and operations

| 경로 | 문서화 주제 |
| --- | --- |
| `docker-compose.yml` | compose service, ports, volume, env. |
| `apps/ndx/docker/baseImage` | Korean FTS, pgvector, Node/tooling local base image archives. |
| `npm/Dockerfile` | npm distribution single final image. |
| `npm` | end-user launcher package and compose template. |
| `scripts/deploy.sh` | build/deploy/report workflow. |
| `.codex/skills` | repo-local agent work procedures. |
| `docs` | durable architectural and operational contracts. |

## 문서 coverage 규칙

문서가 source map의 항목을 설명할 때는 적어도 다음 중 하나를 포함해야 한다.

| 포함 요소 | 예 |
| --- | --- |
| source path | `packages/ndx/src/agent/session/schema.ts` |
| runtime invariant | "PostgreSQL is source of truth" |
| command | `yarn workspace ndx-app lint` |
| API/route/path | `/api/session/health`, `/docs` |
| data shape | `sessiondata.contents.kind` |

이 규칙은 장기적으로 자동 scanner로 강제해야 한다.

현재 1차 강제 지점은 `apps/ndx/src/documents_front/coverage.json`과
`apps/ndx/src/documents_front/audit.mjs`다. coverage source path는 실제
파일/폴더로 존재해야 하고, 적어도 하나의 Markdown 문서에 그대로 언급되어야 한다.
