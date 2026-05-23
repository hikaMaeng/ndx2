# Architecture

Source is partitioned by product surface and runtime:

| Path | Contract |
| --- | --- |
| `src/common` | Runtime-neutral code shared by admin and agent, including UUID and `.ndx` file/path helpers. |
| `src/admin/common` | Admin domain code shared by admin server and front. |
| `src/admin/server` | Admin server-only domain code. |
| `src/admin/front` | Admin front-only domain code; no app UI composition ownership. |
| `src/agent/common` | Agent domain code shared by agent server, session, CLI, and web surfaces. |
| `src/agent/server` | Agent service server-only domain code. |
| `src/agent/cli` | Agent CLI client domain code. |
| `src/agent/web` | Agent web client domain code. |

Packages must never import from `apps/`. App code may import this package by
workspace package name only.
