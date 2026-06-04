# Code Placement

Use this guide before adding or moving runtime code. The default rule is:
put durable product behavior in `packages/ndx`, and put process wiring,
framework lifecycle, HTTP/static serving, socket attachment, and UI composition
in `apps/ndx`.

## Decision Table

| Situation | Put Code Here | Notes |
| --- | --- | --- |
| Shared type, identifier, parser, validation rule, file/path helper, protocol message, resource key, or value object used by agent and webclient | `packages/ndx/src/common` | Must be runtime-neutral unless the subfolder explicitly says otherwise. Protocol contracts live in `common/protocol`; resource lookup contracts live in `common/resource`. |
| Server container path and volume mapping contract | `packages/ndx/src/common/server-path` | Node/server-only path mapping shared by app wiring and agent runtime. Do not import React or app code. |
| Agent execution authority, session state, tool calls, inference, hooks, context reconstruction, account/session DB rules, runtime settings | `packages/ndx/src/agent` | `agent` is the runtime domain itself. Do not recreate a nested `agent/server` layer. |
| Function tools that need connected-client interaction | `packages/ndx/src/agent/tool/base/<tool>` for handler and schema, `packages/ndx/src/common/protocol/session` for socket DTOs, `apps/ndx/src/server/agent` for WebSocket fan-out | Function runtime does not make a tool less of a base tool. Agent code receives a session client bridge abstraction. It must not import `ws` or app modules. |
| Chat folders, chat sessions, chat-only context, and chat tool authority | `packages/ndx/src/agent/chat` | Chat is agent runtime state but not project-scoped coding state. Keep chat folder/session DB rules, chat context reconstruction, and chat tool allowlists here. |
| Agent context usage calculation | `packages/ndx/src/agent/contextusage` | Pure context-window accounting from reconstructed model messages plus optional in-flight assistant content. |
| Agent turn loop orchestration | `packages/ndx/src/agent/turnloop` | Owns user input persistence, context reconstruction, model streaming, assistant persistence, and turn lifecycle events. App socket code only adapts protocol events to transport messages. |
| Agent turn-loop hooks | `packages/ndx/src/agent/hook` | Event-name keyed hook execution plans, built-in system hook arrays, `.ndx/hook/hook.json` loading, and hook effects belong here. |
| Session search projection and `session_history` query policy | `packages/ndx/src/agent/session`, `packages/ndx/src/agent/tool/base/session_history` | `sessionsearch` is derived from `sessiondata` and remains agent session authority. Keep row projection/query SQL with session persistence; keep the function-tool adapter and turn-end system hook policy with the `session_history` base tool. The hook event registration stays in `packages/ndx/src/agent/hook`. |
| Tool executor agent-call messages such as `cot_work` and right-sidebar `session.sidebar_item` | `packages/ndx/src/agent/tool/base/<tool>` for concrete payload creation, `packages/ndx/src/agent/tool/execute/agentcall` for envelope parsing, validation, and routing | Tools emit structured intermediate results but do not own socket transport. Generic routing and common sidebar validation stay in the executor; durable tool-specific rules stay with the base tool folder. `cot_work` live-plan validation, timing policy, and context-prepared reminder hook policy belong under `packages/ndx/src/agent/tool/base/cot_work`, even when the turn loop or hook runner calls them to persist and emit lifecycle records. |
| Tool-specific runtime argument templates such as skill lists | `packages/ndx/src/agent/tool/base/<tool>` for extraction rules, `packages/ndx/src/agent/tool/base/runtimeArgs.ts` for aggregate registration | Runtime argument values that exist for one tool's purpose are documented and implemented inside that tool folder, not in the generic process executor. |
| System-owned skill prompts coupled to base tools | `packages/ndx/src/agent/tool/base/<tool>/systemSkill` for the `SKILL.md`, `packages/ndx/src/agent/tool/base/systemSkills.ts` for aggregate registration, and `packages/ndx/src/agent/init` only for copying registered items into `.ndx/system/skills` | These prompts are runtime policy for built-in tools, not generic init assets. Init first copies ordinary bundled assets, then copies the registered system skills into `.ndx/system/skills` with overwrite enabled so prompt policy stays in sync with the owning tool implementation. |
| Webclient shared DTO, API path constants, browser state shape, session display conversion | `packages/ndx/src/webclient/common` | May be imported by the webclient front and webclient backend. Must not own agent execution. |
| Webclient server-only settings/state persistence helpers | `packages/ndx/src/webclient/server` | Includes browser client state tables and model/provider settings management. May help create agent session requests, but does not own turns, tools, inference, or context reconstruction. |
| Webclient front-only product helpers | `packages/ndx/src/webclient/front` | UI-facing domain helpers only. React component composition stays in `apps/ndx/src/webclient_front`. |
| Webclient application of shared session protocol events to UI state | `packages/ndx/src/webclient/front/session/protocolEventReducer.ts` | `packages/ndx/src/common/protocol` remains the only wire contract for session server and webclient messages. This reducer consumes those protocol DTOs and maps them to webclient-only `SessionUiState`; it must cover every `NDXTurnEventName` with a `Record<NDXTurnEventName, ...>` contract. App socket handlers may perform transport side effects such as finishing pending actions or refreshing lists, but must not encode turn-event-specific `SessionUiState` mutations. |
| Webclient per-session instance model, submodels, pure reducers, and in-memory model store updates | `packages/ndx/src/webclient/front/session/model` | This is the browser-facing session model boundary. It owns the pure one-session object shape and purpose-specific submodels for identity, connection, composer, capabilities, history, runtime, sidebar, and viewport state. It may consume shared protocol DTOs and existing webclient-front reducers, but it must not import React, DOM APIs, WebSocket clients, app bridge modules, or `File` objects. App socket handlers route messages to these reducers instead of mutating session render state directly. |
| Webclient turn-flow projection state | `packages/ndx/src/webclient/front/session/turn` | Turn-flow state is a browser projection of session protocol events and summaries. Fields that share protocol meaning, such as session id, input data id, iteration, title, timestamps, and turn status, must be typed from `NDXSessionTurnSummary`, `NDXSessionIterationSummary`, or `NDXSessionEventMessage` instead of redeclaring parallel unions. Only display/runtime fields such as collapsed state, manually expanded state, rendered text buffers, and tool progress grouping are front-owned. |
| Admin rule shared by admin backend and admin front | `packages/ndx/src/admin/common` | Admin domain contracts stay package-owned even though admin is not a separate app. |
| Admin server-only product rule | `packages/ndx/src/admin/server` | Framework-independent admin HTTP behavior. Express route registration stays in `apps/ndx/src/server/web/admin`. |
| Admin front-only product rule | `packages/ndx/src/admin/front` | UI-facing admin helpers only. React component composition stays in `apps/ndx/src/admin_front`. |
| Process startup, env read, Express lifecycle, health, static serving, Docker runtime glue | `apps/ndx/src/server` | The repository has one deployable Express server. |
| Session socket-server transport wiring | `apps/ndx/src/server/agent` | Attaches to the same HTTP server. Persisted state and agent authority stay in `packages/ndx/src/agent`. |
| Web backend common Express wiring | `apps/ndx/src/server/web/common` | Shared types or middleware for admin and webclient HTTP surfaces. |
| Webclient backend route registration | `apps/ndx/src/server/web/webclient` | Express route wiring for webclient APIs. Imports `ndx/common`, `ndx/agent`, `ndx/webclient/common`, and `ndx/webclient/server` as needed. |
| Admin backend route registration | `apps/ndx/src/server/web/admin` | Express route wiring for admin APIs. Imports `ndx/common` and `ndx/admin/*` as needed. |
| Webclient React shell and composition | `apps/ndx/src/webclient_front` | Uses shadcn/ui, Tailwind, Radix primitives. May import `ndx/common` and `ndx/webclient/common`. |
| Session client-request UI such as `askUserQuestion` | `apps/ndx/src/webclient_front/session/<feature>` | Keep modal state, protocol conversion, and UI in the feature folder. Socket controllers should route messages, not own form logic. |
| Chat sidebar and chat surface composition | `apps/ndx/src/webclient_front/menu/chat`, `apps/ndx/src/webclient_front/session` | UI composition only. It may call webclient APIs and open draft surfaces, but chat turns and tool authority remain in `packages/ndx/src/agent/chat`. |
| Admin React shell and composition | `apps/ndx/src/admin_front` | Uses shadcn/ui, Tailwind, Radix primitives. May import `ndx/common` and `ndx/admin/*`. |
| Dockerfile, compose env, deploy integration | `apps/ndx/docker`, `docker-compose.yml`, `scripts/deploy.sh` | Compose service name is `ndx`; app workspace package name is `ndx-app` to avoid collision with package `ndx`. |
| Durable architecture, API, runtime, or placement decision | `docs/` | Update docs in the same change as the code that depends on the decision. |
| Package-local API, constraints, or testing contract | `packages/ndx/docs` | Keep package docs terse and specific to exported contracts. |
| App-local API, UI locator, deployment, or testing contract | `apps/ndx/docs` | Keep app docs about framework wiring and user-visible service behavior. |

## Turn Loop Non-Intrusion

`packages/ndx/src/agent/turnloop` owns the essential turn lifecycle only:
persist input, reconstruct context, call the model, execute requested tools,
record tool results, handle interrupts, run compaction, emit lifecycle events,
and finalize the assistant row.

Do not place feature-specific policy inside the turn loop when the lifecycle is
unchanged. Provider compatibility, prompt serialization, retry/fallback,
diagnostic classification, UI messaging, socket rendering, tool-specific
payload shaping, and logging interpretation belong to their owning modules.
The turn loop may receive a typed result or call a narrow boundary adapter, but
it must not grow `if event === ...` branches for each new feature unless that
event is itself a lifecycle state transition.

Allowed turn-loop edits:

* add or change an essential lifecycle phase;
* wire an existing lifecycle phase to a stable package-level boundary;
* pass typed context into an existing hook whose documented meaning matches the
  exact interception point;
* fix ordering, persistence, interrupt, compaction, model-call, or tool-call
  orchestration bugs.

Disallowed turn-loop edits without explicit user approval:

* provider-specific fallback policy;
* prefix-cache diagnostics that can live at provider serialization boundaries;
* webclient display text or turn-card state;
* tool-specific result interpretation;
* per-feature debug-event classification;
* hidden state stores that only exist to support a feature outside the lifecycle.

## Hard Boundaries

* Never import from `apps/*` into `packages/*`.
* Never use relative imports across workspace boundaries. Use workspace package exports such as `ndx/common`, `ndx/agent`, or `ndx/webclient/common`.
* `apps/ndx/src/webclient_front` must not import `ndx/agent`; it talks to agent authority through webclient protocols and server APIs.
* `packages/ndx/src/common/protocol` owns the shared wire protocol only: message names, DTOs, event names, and validation/parsing that both the session server and webclient can use without React or webclient UI state.
* `apps/ndx/src/webclient_front` must route session turn events through `ndx/webclient/front` protocol event reducers. Do not add app-local switch/if chains that mutate `SessionUiState` for individual `NDX_TURN_EVENT` values.
* `apps/ndx/src/webclient_front` must not own canonical per-session history, running turn, streaming, sidebar, or detail-expansion state. It selects and renders session model snapshots from `packages/ndx/src/webclient/front/session/model`, and may keep only DOM/runtime adjuncts such as actual `File` handles, object URLs, element refs, and modal open state.
* Agent execution authority belongs to `packages/ndx/src/agent`. Admin, webclient, CLI, and other future clients may request or display agent work, but must not own the agent loop, tool calls, inference, or context reconstruction.
* Chat sessions are not project sessions. Do not attach them to `projectid` or project paths. They belong to a `chatfolder`, and every persisted chat session must have a folder.
* PostgreSQL-backed session truth and context reconstruction rules belong to the agent domain. Do not create an authoritative in-memory live-session store in an app module.
* Do not add `packages/ndx/src/agent/cli` until an explicit CLI client plan exists. A future CLI should be evaluated as a separate client surface, not as agent runtime code by default.
* Do not add hook events, hook folders, system hook arrays, hook runners,
  implicit `runXxxHook` helpers, or hook-like execution paths unless the user
  directly requested or explicitly approved that hook surface expansion. Moving
  an existing hook call to match its documented meaning is allowed; creating a
  new hook to avoid a placement mismatch is not.

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
2. Is it only about connecting a framework, route, socket, process, build, or deployment surface? Put it in `apps/ndx`.
3. Is it agent execution, session state, tool authority, model inference, or context reconstruction? Put it in `packages/ndx/src/agent`.
4. Is it webclient presentation state, DTOs, API paths, or browser-facing model/provider management? Put it under `packages/ndx/src/webclient`.
5. Is it UI composition or layout? Put composition in `apps/ndx/src/webclient_front` or `apps/ndx/src/admin_front`; put reusable UI-facing domain helpers in the matching package front surface.

If the right location is unclear, update this document with the new decision as part of the change.
