# Architecture

Router node. The agent app runs one Express HTTP server in one Node runtime:

* the server serves backend health/API metadata and the built Vite front end on `PORT`.
* the same server owns the WebSocket upgrade path and session health routes.

Drill down from the symbol in the last column; do not read the whole partition.
Consumer edges and invariants are in [constraints.md](constraints.md#blast-radius).

| Path | Responsibility | Drill-down |
| --- | --- | --- |
| `src/server` | Express process, web-client HTTP routes, static serving, socket attachment, process composition. | `src/server/index.ts` (boots `initServer`, `createApp`, `attachSessionSocketServer`) |
| `src/server/app.ts` | Express app assembly: web routes, static front, `/docs` site. | `src/server/app.ts#createApp` |
| `src/server/agent` | Session socket-server attachment and session transport wiring. | `src/server/agent/socketServer.ts#attachSessionSocketServer` |
| `src/server/web/webclient` | Webclient HTTP route registration over `ndx/webclient/server`. | `src/server/web/webclient/index.ts` |
| `src/webclient_front` | Session web client React shell. | `src/webclient_front/app/App.tsx#App` |
| `src/documents_front` | Markdown developer doc site served at `/docs`, with `audit.mjs` drift guard. | `src/documents_front/main.tsx` |
| `assets/i18n` | Bundled fallback locale JSON served at `/assets/i18n/*.json`. | — |
| `docker` | App runtime Dockerfile, local base-image archives, npm release publish script, and entrypoint. | `docker/baseImage/load-file-image.sh`, `docker/Dockerfile` |

`apps/ndx` depends on `ndx/common` and `ndx/agent/*` (agent authority) and
`ndx/webclient/*` (presentation). Keep agent execution authority in the agent
server surface; web clients are only presentation and interaction clients.

The app server serves `/assets/i18n` from `/ndx/.ndx/i18n` first and then serves
bundled `apps/ndx/assets`, so locale updates can be placed under
`volume/.ndx/i18n` without rebuilding the TypeScript front end.

Runtime volume path ownership is documented in `../../docs/runtime-volume.md`.
Local base-image and npm single-image release ownership is documented in
`../../docs/npm-release.md`.
