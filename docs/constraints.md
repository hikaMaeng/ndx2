# Constraints

Use Yarn Plug'n'Play, Turbo, service modules under `apps/*`, and framework-agnostic shared libraries under `packages/*`.

Repository constraints:

* Runtime implementation language is TypeScript.
* Do not port another agent implementation mechanically.
* Use React, shadcn/ui-style components, Tailwind CSS, and Radix UI primitives for frontend implementation.
* Use Express for the server unless a future documented architecture decision replaces it.
* Never import from `apps/*` into `packages/*`.
* Cross-package imports use workspace package names, not relative paths across package boundaries.
* `apps/admin` depends on `ndx/common` and `ndx/admin/*`.
* `apps/agent` depends on `ndx/common` and `ndx/agent/*`.
* `apps/agent/src/server` owns the single agent Express server on `PORT`.
* `apps/agent/src/server/agent` owns session socket-server transport wiring attached to that same HTTP server.
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
* PostgreSQL runs as local compose service `pgvector` with image `pgvector/pg17`, no external host port exposure, and default account credentials `ndev/ndev`.
* The DB working directory is `./pgvector/data`, and this directory is intentionally ignored from version control.

UI test contracts for frontend packages must document stable landmarks, accessible names, and approved test ids before relying on them in headless browser tests.
