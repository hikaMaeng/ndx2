# Architecture

The agent app runs one Express HTTP server in one Node runtime:

* the server serves backend health/API metadata and the built Vite front end on `PORT`.
* the same server owns the WebSocket upgrade path and session health routes.

Source is split into:

| Path | Responsibility |
| --- | --- |
| `src/server` | Express process, web-client HTTP routes, static serving, socket attachment, and process composition. |
| `src/server/agent` | Session socket-server attachment and session transport wiring. |
| `src/webclient_front` | Session web client shell. |
| `assets/i18n` | Bundled fallback locale JSON files served at runtime from `/assets/i18n/*.json`. |

`apps/ndx` depends on `ndx/common` and `ndx/agent/*`. Keep agent execution authority in the agent server surface; web clients are only presentation and interaction clients.

The app server serves `/assets/i18n` from `/ndx/.ndx/i18n` first and then serves
bundled `apps/ndx/assets`, so locale updates can be placed under
`volume/.ndx/i18n` without rebuilding the TypeScript front end.

Runtime volume path ownership is documented in `../../docs/runtime-volume.md`.
