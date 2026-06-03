# Architecture

The baseline service shape is Express server plus Vite React front shell. Production serving is through the Express server.

The target architecture is a TypeScript-first web-service monorepo:

* `apps/ndx` contains the administration service.
* `apps/ndx` contains the agent session service.
* `packages/ndx` contains shared common, admin, and agent domain contracts.
* The agent server is the only component allowed to execute agent loops, call tools, manage model inference, reconstruct context, or persist session events.
* Browser, CLI, VS Code, and native clients are session clients. They connect to the agent server session socket and render downstream events, but do not own agent runtime state.
* PostgreSQL is the authoritative store for accounts, session metadata, context events, task-turn progress, tool logs, and resumable execution state.
* Application containers share one runtime volume mounted at `/ndx`; see `runtime-volume.md` for affected paths.

Logical server surfaces:

| Surface | Responsibility |
| --- | --- |
| Agent server session socket | Agent turn execution, client interaction, downstream event streaming |
| Admin web server | Session management, settings, logs, operational status |
| Session web client | Browser UI connected to the session WebSocket server |
| Account server | Account creation, deletion, login state, default-account behavior |

`apps/ndx` owns `src/server` and `src/webclient_front`. The single Express server under
`src/server` serves backend API routes, built front-end assets, and the session
WebSocket upgrade surface; socket-specific transport wiring lives under
`src/server/agent`.

Code placement rules are maintained in `code-placement.md`. Use that document
when deciding whether new code belongs in `apps/*` or `packages/ndx`.

Do not introduce an in-memory live-session registry as a source of truth. Any memory held during model calls or tool execution is disposable and must be reconstructable from PostgreSQL.
