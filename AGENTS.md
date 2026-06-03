# Repository Instructions

This repository is a web-service project scaffolded by `web-service-scaffold`.
Keep detailed procedures in repository-local skills and durable project docs.

## Language

Default responses are Korean.

## Project Direction

This project builds a new coding agent inspired by the open-source OpenAI Codex
agent, but it is not a mechanical port.

OpenAI Codex source is Apache-2.0 licensed. If code, text, or design is copied
or adapted from that upstream, preserve the required Apache-2.0 notices and
document the provenance. The repository license itself is undecided; do not
state or imply that this project is Apache-2.0 unless a future license decision
updates the repository docs.

Primary product constraints:

* Implement new runtime code in TypeScript, not Rust.
* Use the Turbo monorepo structure as the architectural boundary.
* Center the product on a web server that hosts the agent session server,
  administration site, session web client, and account-management surface.
* Keep all agent execution authority inside the session server. Other clients
  may connect to it, but they must not own agent-loop, tool-call, inference, or
  context-reconstruction logic.
* Use PostgreSQL as the source of truth for session data. Do not introduce a
  separate live-session memory store as an authoritative state holder.
* Use `pgvector` container for PostgreSQL with Korean text search extension requirements as the canonical development datastore.
* Treat `ndev` as the mandatory default account when no explicit login flow has
  selected another account.

### Agent Prompt Prefix Cache Contract

Agent model requests must preserve provider prefix-cache reuse whenever the
request has no intentional one-shot payload.

The model-visible prompt shape is:

1. stable developer/system instructions;
2. stable user instruction prelude, including environment context;
3. ordered append-only session history reconstructed from PostgreSQL;
4. explicit one-request payloads such as inlined attachment bytes.

Do not insert, remove, reorder, or rewrite model-visible content before the
append-only history tail during a running turn. The next model request should
start with the complete previous model request byte-for-byte, then append new
tool calls, tool results, reminders, or assistant/user history. A shorter common
prefix is not sufficient.

`environment_context` must be part of the stable prelude, not a separate
message after history. Hooks that create model-visible rows, including
`cot_work_reminder`, must append them to `sessiondata` and expose them in the
same append position; never temporarily splice them into the middle of the
request.

The accepted exception is one-request attachment payloads. Binary/image/file
bytes may be appended for a single request and then replaced by durable path
references because repeatedly paying that context cost is worse than breaking
the prefix for that attachment turn.

Any change to agent context reconstruction, model request assembly, hooks,
tool-call continuation, or fallback text serialization must check this contract
and add/update a regression test when it could affect prompt ordering.

### Turn Loop And Hook Governance

The turn loop is an orchestration boundary, not a feature catch-all. Do not add
feature policy, provider compatibility policy, UI display policy, logging
interpretation policy, retry policy, or diagnostic classification directly to
`packages/ndx/src/agent/turnloop` unless the feature changes the essential turn
lifecycle itself: accepting input, reconstructing context, calling the model,
executing tools, recording results, handling interruption, compaction, or
finalizing the assistant response.

When a feature is adjacent to turn execution but does not change that lifecycle,
place the behavior at the owning boundary:

* provider request serialization, fallback, retry, and compatibility behavior:
  `packages/ndx/src/common/responseapi` or provider-specific adapters;
* hook policy and hook effects: `packages/ndx/src/agent/hook`;
* tool-specific behavior: `packages/ndx/src/agent/tool/base/<tool>`;
* webclient display and turn-event UI state: `packages/ndx/src/webclient/front`
  or `apps/ndx/src/webclient_front` only for React composition;
* transport fan-out: `apps/ndx/src/server/agent`.

Hook surface area is strictly frozen unless the user explicitly approves a new
hook. Do not add a new hook event, hook folder, system hook array, hook runner,
implicit `runXxxHook` helper, hook-like callback, or hidden hook execution path
without direct user instruction or explicit approval. Reuse an existing hook
only when its documented meaning matches the interception point. If the meaning
does not match, move the existing hook call to the correct boundary or implement
the feature in the owning non-hook module; do not invent another hook to bypass
the mismatch.

Before touching turn-loop or hook code, update `docs/runtime-control.md` and
`docs/code-placement.md` when the intended placement or hook meaning is not
already documented. Tests must prove both the behavior and the non-intrusion
boundary: the turn loop should see only lifecycle callbacks or typed effects,
not feature-specific branching.

### PostgreSQL (`pgvector`) 운영 계약

The agent Docker image must include PostgreSQL/pgvector runtime support using:

* prebuilt base image `ghcr.io/hikamaeng/ndx2-pgvector:<version>`
* built-in defaults `POSTGRES_USER=ndev`, `POSTGRES_PASSWORD=ndev`, and `PGDATA=/ndx/pgvector/pgdata`
* host data under `./volume/pgvector` through the agent `/ndx` bind mount

No external host port is exposed for PostgreSQL.

The `pgvector` Dockerfile must live at `./pgvector/Dockerfile.pgvector`. The
`./pgvector/publish-ghcr.sh` script publishes the slow PostgreSQL image with
Korean morphology (mecab-ko + textsearch_ko) tooling to GHCR, and
`apps/agent/docker/Dockerfile` must use that image as its base.

Required documentation targets for this contract:

* `docs/session-data.md`: durable PostgreSQL-backed context storage and reconstruction.
* `docs/sessions.md`: session identity and cross-client continuity assumptions.
* `docs/usage.md`: local compose workflow and DB 접속/점검 방법.

Durable product details belong under `docs/`:

* `docs/licensing.md` for upstream license and undecided project license rules.
* `docs/accounts.md` for account identity and deletion semantics.
* `docs/sessions.md` for session identity, metadata, and client interaction.
* `docs/session-data.md` for PostgreSQL-backed context reconstruction.
* `docs/runtime-control.md` for interrupts, tool cancellation, queued work, and
  mid-turn interjection behavior.
* `docs/code-placement.md` for deciding where new code belongs.

## Workspace

This is a TypeScript + Turbo monorepo using Yarn 4 Plug'n'Play.

For new scaffolds, use the current working directory as the target repository
root and run `git init` before generating project files if `.git/` is absent.
Do not ask whether this is a new or existing repository; detect it from `.git/`.

Required root shape:

* `package.json` with `packageManager: "yarn@..."`, workspaces for `apps/*`
  and `packages/*`, and shared `build`, `test`, `lint`, and `deploy` scripts.
* `.yarnrc.yml` with `nodeLinker: pnp` and `enableGlobalCache: true`.
* `yarn.lock` generated by the scaffold installer from the bundled lock
  template and installable with `yarn install --immutable`.
* `turbo.json` with explicit task `inputs` and `outputs`.
* `tsconfig.json` with workspace package-name paths only where runtime
  resolution remains valid.
* `apps/` for deployable service modules.
* `packages/` for framework-agnostic shared libraries.
* Docker host ports assigned by the scaffold installer from the
  `18080-18999` range, avoiding live listeners and existing scaffold
  reservations.

Change dependencies with Yarn commands and commit `yarn.lock` when dependency
work is requested.

Do not add `pnpm` files, workspace `node_modules`, or package-manager
migrations unless this repository explicitly changes that policy in docs.

## Code Style

Keep implementation direct. Do not create functions, classes, modules, or files
whose abstraction is effectively the same as their name.

Abstraction rules:

* Prefer one clear exported or top-level function over a chain of private
  helpers when the helpers are used only once.
* Allow only first-level decomposition by default. A helper called by the main
  function must contain real branching, IO boundaries, reusable policy, or
  meaningful domain invariants.
* Do not split that helper again unless concrete duplication or a second caller
  already exists.
* Do not create a private function just to replace one expression, one method
  call, one regular expression, one `trim`/`toLowerCase`, or one filename
  sanitization line.
* Repeated one-line expressions still do not automatically deserve a function;
  inline them unless naming the concept prevents a real bug or captures a
  domain invariant.
* File-local helpers that are not exported and are called once are suspect.
  Inline them unless they isolate a genuine boundary such as parsing,
  validation, persistence, network IO, or a nontrivial algorithm.
* Avoid classes unless identity, mutable lifecycle, polymorphism, or resource
  ownership is required. Do not use classes as namespaces.

## Service Shape

`apps/<service>` owns each web service. The server lives in `src/server`, the
Vite React front end lives in `src/front`, and Docker assets live in
`apps/<service>/docker`.

## App And Domain Package Boundary

Apps may depend on packages, but packages must never depend on apps.
`apps/<service>` owns orchestration, framework lifecycle, HTTP/static serving,
composition, and process wiring. Domain rules, invariants, cross-request state
interpretation, and framework-independent product logic belong in packages.

This repository uses one shared product package, `packages/ndx`, for the current
admin and agent surfaces. Before adding or moving implementation code, read and
follow `docs/code-placement.md`.

Current app/package placement:

* `apps/admin` is the administration service.
* `apps/agent` is the agent session service.
* `packages/ndx/src/common` holds runtime-neutral shared contracts.
* `packages/ndx/src/admin/common`, `src/admin/server`, and `src/admin/front`
  hold admin domain contracts.
* `packages/ndx/src/agent/common`, `src/agent/server`, `src/agent/cli`, and
  `src/agent/web` hold agent domain contracts.
* `apps/admin` may depend on `ndx/common` and `ndx/admin/*`.
* `apps/agent` may depend on `ndx/common` and `ndx/agent/*`.
* `apps/agent/src/session` owns session socket-server transport wiring and
  attaches to the same Express server while that remains sufficient.

Non-domain packages should stay cohesive and standalone. Avoid dependencies
between unrelated packages unless there is a clear, durable shared abstraction;
do not turn `packages/` into a layered application graph.

Use React plus shadcn/ui for front-end implementation and Express for the
server. Production serving is through the Express server serving the built
front-end assets.

Frontend UI implementation must use shadcn/ui components, Tailwind CSS, and
Radix UI primitives by default. Do not introduce another UI component framework
unless the user explicitly overrides this repository contract.

Never import from `apps/` into `packages/`. Cross-package imports use workspace
package names, not relative paths across package boundaries. App code imports
the product package through exports such as `ndx/common`, `ndx/admin/server`,
or `ndx/agent/server`.

The scaffold baseline is intentionally small: health endpoint, one accessible
front shell, deploy path, docs, and smoke tests. Do not infer or implement a
product workflow, data model, queue, agent runner, dashboard, or other domain
feature unless the user explicitly requests that feature work.

Compose project name is the target folder project name, even when it is one
character. The Yarn root package name may append `-root` only to avoid a
workspace name collision; do not reuse that package name as the Compose project
name. Container name is the app service name from `apps/<service>` without a
repository prefix. Docker Compose rejects one-character explicit
`container_name` values, so one-character services use `<service>-app`.

## Workflow

Use the repository-local skills installed under `.codex/skills`:

* `web-deploy-docker` for explicit Docker live deploy of one `apps/<service>`.
* `monorepo-architecture-guard` for workspace, package, TypeScript, env, and
  service-boundary rules.
* `docker-compose-module-design` for compose, Dockerfile, container ownership,
  and deploy entrypoint rules.
* `headless-browser-markup` for front-end markup contracts and browser-test
  locators.
* `package-docs-writer` for package README and docs structure.
* `agenttest` for strict JSON test suites and reports.

When the user explicitly asks to use `web-deploy-docker` with a service such as
`apps/dashboard`, do not search for the skill file or inspect repository
structure first. Immediately run `bash scripts/deploy.sh apps/dashboard` from
the repository root. The script performs local build, Docker Compose refresh,
health checks, and prints a `deploy-report-begin` / `deploy-report-end` block;
base the final answer on that block.

## Fast Scaffold Completion

Initial scaffold creation is complete when the scaffold script has copied the
baseline, substituted placeholders, passed its required-file checks, and written
the scaffold suite/report/summary under `test/YYYYMMDD/`.

Do not run install, build, tests, `npm run deploy`, browser checks, or Git
commit after initial scaffold creation unless the user explicitly asks for
verification, deployment, or commit.

For later implementation work, use the relevant repository-local skills and run
the checks needed for that requested change.

For later implementation work that creates, moves, or classifies code, consult
`docs/code-placement.md` first and keep that guide updated when a new placement
decision is made.

## Code Style

Keep implementation direct. Do not create functions, classes, modules, or files
whose abstraction is effectively the same as their name.

Abstraction rules:

* Prefer one clear exported or top-level function over a chain of private
  helpers when the helpers are used only once.
* Allow only first-level decomposition by default. A helper called by the main
  function must contain real branching, IO boundaries, reusable policy, or
  meaningful domain invariants.
* Do not split that helper again unless concrete duplication or a second caller
  already exists.
* Do not create a private function just to replace one expression, one method
  call, one regular expression, one `trim`/`toLowerCase`, or one filename
  sanitization line.
* Repeated one-line expressions still do not automatically deserve a function;
  inline them unless naming the concept prevents a real bug or captures a
  domain invariant.
* File-local helpers that are not exported and are called once are suspect.
  Inline them unless they isolate a genuine boundary such as parsing,
  validation, persistence, network IO, or a nontrivial algorithm.
* Avoid classes unless identity, mutable lifecycle, polymorphism, or resource
  ownership is required. Do not use classes as namespaces.
