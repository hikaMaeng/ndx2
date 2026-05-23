# Code Placement

Use this guide before adding or moving runtime code. The default rule is:
put durable product behavior in `packages/ndx`, and put process wiring,
framework lifecycle, and UI composition in `apps/*`.

## Decision Table

| Situation | Put Code Here | Notes |
| --- | --- | --- |
| Shared type, identifier, parser, validation rule, file/path helper, or value object used by both admin and agent | `packages/ndx/src/common` | Must be runtime-neutral. Do not import Express, React, Vite, database clients, or app files. UUIDv7 and `.ndx` file helpers live here. |
| Admin rule shared by admin server and admin front | `packages/ndx/src/admin/common` | Examples: admin-visible session metadata rules, account display invariants, admin command labels. |
| Admin server-only product rule | `packages/ndx/src/admin/server` | Framework-independent rules for admin HTTP behavior. Express route registration stays in `apps/admin/src/server`. |
| Admin front-only product rule | `packages/ndx/src/admin/front` | UI-facing admin domain helpers only. React component composition stays in `apps/admin/src/front`. |
| Agent rule shared by server, session transport, CLI, and web client | `packages/ndx/src/agent/common` | Examples: session ids, event envelopes, turn states, message ordering, interrupt state names. |
| Agent user-visible resource keys, language normalization, and fallback resource lookup | `packages/ndx/src/agent/common/resource` | The session server defaults to English. Web clients may send an optional language on session requests. App servers may overlay runtime `/ndx/assets/i18n/*.json` and bundled `apps/agent/assets/i18n/*.json` resources before falling back to package defaults. |
| Agent server-only product rule | `packages/ndx/src/agent/server` | Agent-loop authority, tool-call policy, inference orchestration rules, context reconstruction contracts, and PostgreSQL-backed session semantics belong here unless they require framework wiring. |
| Agent context usage calculation | `packages/ndx/src/agent/server/contextusage` | Pure context-window accounting from reconstructed model messages plus optional in-flight assistant content. Socket and HTTP handlers only forward the computed value. |
| Agent turn loop orchestration | `packages/ndx/src/agent/server/turnloop` | Owns user input persistence, context reconstruction, model streaming, assistant persistence, and turn lifecycle events. App socket code only adapts protocol events to transport messages. |
| Agent turn-loop hooks | `packages/ndx/src/agent/server/hook` | Event-name keyed hook execution plans, built-in system hook arrays, `.ndx/hook/hook.json` process-hook loading, and hook effects that can alter model messages, tools, or turn completion belong here. Hook invocation points stay in `turnloop`. |
| Agent CLI client rule | `packages/ndx/src/agent/cli` | CLI client formatting, command interpretation, and client-side request shaping. Must not own agent-loop authority. |
| Agent web client rule | `packages/ndx/src/agent/web` | Browser session-client domain helpers. React composition stays in `apps/agent/src/front`. |
| Admin Express route, middleware, static serving, process startup, env read, Docker runtime glue | `apps/admin/src/server` | May import from `ndx/common`, `ndx/admin/common`, and `ndx/admin/server`. |
| Admin React pages, app shell, component composition, shadcn/ui usage, Tailwind layout | `apps/admin/src/front` | May import from `ndx/common`, `ndx/admin/common`, and `ndx/admin/front`. |
| Agent Express route, HTTP API wiring, process startup, env read, static serving | `apps/agent/src/server` | May import from `ndx/common`, `ndx/agent/common`, and `ndx/agent/server`. The single Express server owns backend API routes, built front-end serving, and session socket attachment. |
| Agent session socket-server attachment and transport wiring | `apps/agent/src/server/agent` | Attaches to the same HTTP server as the web backend and front-end serving. Persisted state and agent authority still belong in `packages/ndx/src/agent/server`. |
| Agent React session web client shell and component composition | `apps/agent/src/front` | May import from `ndx/common`, `ndx/agent/common`, and `ndx/agent/web`. |
| Agent front app bootstrap, localization, local cache, and backend calls for app-wide client state | `apps/agent/src/front/app` | Keep only app shell state and cross-context setup here. Backend calls in `app/api` are limited to metadata and web-client state persistence. |
| Agent front menu context | `apps/agent/src/front/menu` | Own menu/sidebar composition, menu-owned dialogs, and menu backend API calls such as projects, users, and menu session lists. |
| Agent front session context | `apps/agent/src/front/session` | Own session page composition, session-owned dialogs, backend fallback calls for session data/input/interrupts, and direct session socket-server communication under `session/socket`. |
| Agent front shared UI primitives | `apps/agent/src/front/components/ui` | Keep shadcn/ui-style primitives here only. Do not place domain dialogs, pages, layout, or API modules under generic `components`. |
| Dockerfile, compose env, deploy integration | `apps/<service>/docker`, `docker-compose.yml`, `scripts/deploy.sh` | Keep service names aligned with `apps/admin` and `apps/agent`. |
| Durable architecture, API, runtime, or placement decision | `docs/` | Update docs in the same change as the code that depends on the decision. |
| Package-local API, constraints, or testing contract | `packages/ndx/docs` | Keep package docs terse and specific to exported contracts. |
| App-local API, UI locator, deployment, or testing contract | `apps/<service>/docs` | Keep app docs about framework wiring and user-visible service behavior. |

## Hard Boundaries

* Never import from `apps/*` into `packages/*`.
* Never use relative imports across workspace boundaries. Use workspace package exports such as `ndx/common` or `ndx/agent/server`.
* `apps/admin` may depend only on the common and admin surfaces of `ndx`.
* `apps/agent` may depend only on the common and agent surfaces of `ndx`.
* Agent execution authority belongs to the agent server session surface. Admin, CLI, web, and other clients may request or display agent work, but must not own the agent loop, tool calls, inference, or context reconstruction.
* PostgreSQL-backed session truth and context reconstruction rules belong to the agent server domain. Do not create an authoritative in-memory live-session store in an app module.

## Abstraction Budget

Keep code direct at the chosen placement. Do not create file-local helpers that
only name a one-line expression, method call, regex, normalization, or filename
sanitization. A helper called only once should usually be inlined.

Use at most first-level decomposition unless there is concrete duplication, a
second caller, or a meaningful boundary such as parsing, validation,
persistence, network IO, a nontrivial algorithm, or a real domain invariant.
Avoid classes unless identity, mutable lifecycle, polymorphism, or resource
ownership is required.

## Placement Checks

Before writing code, answer these questions:

1. Does this code make a product rule true independent of Express, React, Vite, Docker, or process startup? Put it in `packages/ndx`.
2. Is it only about connecting a framework, route, socket, process, build, or deployment surface? Put it in the owning `apps/*` module.
3. Is it agent execution, session state, tool authority, model inference, or context reconstruction? Put the rule in `packages/ndx/src/agent/server` and only the transport wiring in `apps/agent`.
4. Is it UI composition or layout? Put composition in `apps/<service>/src/front`; put reusable UI-facing domain helpers in the matching `packages/ndx/src/*/front` or `src/agent/web` surface.
5. Would another app need this exact behavior without depending on a framework? Prefer `packages/ndx/src/common` or the matching product-surface common directory.

If the right location is unclear, update this document with the new decision as part of the change.
