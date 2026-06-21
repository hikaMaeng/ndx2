# Architecture

Router node. Source is partitioned by product surface and runtime. Drill down
from the symbol in the last column; do not read the whole partition.

| Path | Contract | Drill-down |
| --- | --- | --- |
| `src/common` | Runtime-neutral code shared by agent and webclient (UUID, `.ndx` file/path helpers). | `src/common/path.ts#resolveNdxPath` |
| `src/agent` | Agent runtime authority for account, session, turn loop, tools, hooks, context. | `src/agent/session.ts#Session` |
| `src/webclient/common` | DTO and API protocol shared by browser and server routes. | `src/webclient/common/dto.ts` |
| `src/webclient/server` | Server-side webclient persistence and settings domain. | `src/webclient/server/settings.ts#loadModelSettings` |

Packages must never import from `apps/`. App code imports this package by
workspace package name only. Consumer edges and invariants per subpath are in
[constraints.md](constraints.md#blast-radius).
