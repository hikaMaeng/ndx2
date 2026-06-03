# Architecture

Source is partitioned by runtime:

| Path | Contract |
| --- | --- |
| `src/common` | Runtime-neutral domain code shared by server and front. |
| `src/server` | Server-only domain code. Must not import from `src/front`. |
| `src/front` | Front-only domain code. Must not own app UI composition. |

Packages must never import from `apps/`. App code may import this package by
workspace package name only.
