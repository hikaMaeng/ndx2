# Constraints

Use Yarn Plug'n'Play, Turbo, service modules under `apps/*`, and framework-agnostic shared libraries under `packages/*`.

Repository constraints:

* Runtime implementation language is TypeScript.
* Do not port another agent implementation mechanically.
* Use React, shadcn/ui-style components, Tailwind CSS, and Radix UI primitives for frontend implementation.
* Use Express for the server unless a future documented architecture decision replaces it.
* Never import from `apps/*` into `packages/*`.
* Cross-package imports use workspace package names, not relative paths across package boundaries.
* `apps/ndx` depends on `ndx/common`, `ndx/agent`, and `ndx/webclient/*`.
* `apps/ndx/src/server` owns the single agent Express server on `PORT`.
* `apps/ndx/src/server/agent` owns session socket-server transport wiring attached to that same HTTP server.
* New code must follow `docs/code-placement.md` before creating files or moving behavior across app/package boundaries.

Product constraints:

* The project license is undecided; see `licensing.md`.
* `ndev` must always exist as the default account.
* Account names are immutable after creation.
* Account names may contain any non-whitespace Unicode characters and are limited to 200 characters.
* Passwords are optional; accounts default to no password at creation.
* Deleting an account deletes all session information owned by that account.
* Agent functionality is available only through the agent server session surface.
* PostgreSQL is the only source of truth for session state and context history.
* In-memory context assembled for a model request is temporary and must be rebuilt for every request from durable records.
* PostgreSQL runs inside the agent container from `ghcr.io/hikamaeng/ndx2-pgvector:<version>`, with no external host port exposure and default account credentials `ndev/ndev`.
* The DB working directory is `/ndx/pgvector/pgdata` in the container and `./volume/pgvector` under the host ndx root volume; this directory is intentionally ignored from version control.

UI test contracts for frontend packages must document stable landmarks, accessible names, and approved test ids before relying on them in headless browser tests.
