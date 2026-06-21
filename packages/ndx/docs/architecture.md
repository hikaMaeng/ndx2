# Architecture

Router node. Source is partitioned by product surface and runtime. Drill down
from the symbol in the last column; do not read the whole partition. Consumer
edges and invariants per subpath are in
[constraints.md](constraints.md#blast-radius).

| Path | Contract | Drill-down |
| --- | --- | --- |
| `src/common` | Runtime-neutral code shared by agent and webclient: protocol DTOs, UUIDv7, resource keys, response API. | `src/common/index.ts#serviceDomain` |
| `src/common/protocol` | Wire contracts shared by every surface: identity, project, session, turn, socket frames. | `src/common/protocol/index.ts` |
| `src/common/server-path` | Host/container path mapping for the runtime volume. | `src/common/server-path/pathMapping.ts#defaultServerVolumeMap` |
| `src/common/responseapi` | Provider-neutral model request/response abstraction. | `src/common/responseapi/request.ts#requestModelResponse` |
| `src/agent` | Agent runtime authority: account, session, turn loop, tools, hooks, context, compaction, self-check. | `src/agent/init/index.ts#initServer` |
| `src/agent/session` | PostgreSQL session/sessiondata domain; append-only history. | `src/agent/session/createSession.ts#createSession` |
| `src/agent/turnloop` | Coding-session turn loop: iteration, model-call, tool-call, compaction. | `src/agent/turnloop/index.ts` |
| `src/agent/tool` | Tool registry and process/function execution. | `src/agent/tool/registry.ts#listAvailableTools` |
| `src/agent/hook` | Turn lifecycle hook runtime and built-in hook plan. | `src/agent/hook/index.ts` |
| `src/agent/context` | Developer/user/environment/skill prompt prelude assembly. | `src/agent/context/index.ts` |
| `src/webclient/common` | Browser/server shared webclient DTO and API protocol. | `src/webclient/common/protocol/index.ts#NDX_AGENT_WEB_API` |
| `src/webclient/front` | Browser-facing domain helpers and model-render stores (no React composition). | `src/webclient/front/index.ts#webclientFrontDomain` |
| `src/webclient/server` | Server-side webclient persistence and `.ndx/settings.json` domain. | `src/webclient/server/settings/model-patch/index.ts#applyModelFolderPatch` |

Packages must never import from `apps/`. App code imports this package by
workspace package name only (see [usage.md](usage.md)). The agent surface owns
execution authority; webclient surfaces are presentation and interaction only.
