ndx2 is a TypeScript Turbo monorepo for a web-service-centered coding agent.

| Goal | File |
| --- | --- |
| Understand purpose | [docs/overview.md](docs/overview.md) |
| Architecture | [docs/architecture.md](docs/architecture.md) |
| API reference | [docs/api.md](docs/api.md) |
| Usage | [docs/usage.md](docs/usage.md) |
| Constraints | [docs/constraints.md](docs/constraints.md) |
| Internals | [docs/internals.md](docs/internals.md) |
| Testing | [docs/testing.md](docs/testing.md) |

| Subject | Path |
| --- | --- |
| License posture | [docs/licensing.md](docs/licensing.md) |
| Account model | [docs/accounts.md](docs/accounts.md) |
| Session model | [docs/sessions.md](docs/sessions.md) |
| Session data source | [docs/session-data.md](docs/session-data.md) |
| Runtime volume | [docs/runtime-volume.md](docs/runtime-volume.md) |
| Interrupts and queued work | [docs/runtime-control.md](docs/runtime-control.md) |
| Code placement | [docs/code-placement.md](docs/code-placement.md) |

This repository starts from a small verified web-service scaffold. Product behavior beyond health checks, the front shell, and deployment must be implemented explicitly.

This repository's own license is not selected yet. Preserve upstream notices and provenance for any copied or derived external material, and do not label this project under a specific license unless the repository license is intentionally changed.

Remote cache is disabled by default. Enable Turbo remote caching only after the repository has a shared cache owner and documented credentials flow.
