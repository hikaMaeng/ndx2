# Architecture

Source is partitioned by product surface and runtime:

| Path | Contract |
| --- | --- |
| `src/common` | Runtime-neutral code shared by agent and webclient, including UUID and `.ndx` file/path helpers. |
| `src/agent` | Agent runtime authority for account, session, turn loop, tools, hooks, and context. |
| `src/webclient/common` | Webclient DTO and API protocol contracts shared by browser and server routes. |
| `src/webclient/front` | Browser-facing helper code without React composition ownership. |
| `src/webclient/server` | Server-side webclient persistence and settings domain logic. |
| `src/webclient/server/settings` | `.ndx/settings.json` settings domain, including model catalog and model patch handling. |

Packages must never import from `apps/`. App code may import this package by
workspace package name only.
