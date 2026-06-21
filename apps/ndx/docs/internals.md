# Internals

## Decisions

* No agent-loop implementation lives in the app. Why: agent domain authority
  lives in `packages/ndx/src/agent`; the app only wires process, HTTP, socket,
  and UI. Socket/session process wiring belongs under `src/server/agent` and
  attaches to the same Express server as the web backend.
* One Express server hosts web HTTP, the `/session` WebSocket upgrade, and the
  `/docs` site. Why: single process and port simplify the Docker runtime and
  same-origin browser access.
* `/assets/i18n` is served from `/ndx/.ndx/i18n` before bundled assets. Why:
  locale overrides drop into the runtime volume without rebuilding the front end.
* Local deploy uses a file-backed base image while npm release builds one final
  image directly. Why: clone-and-build loops avoid registry base pulls, while
  npm users pull one public multi-arch image.
* The webclient front renders from model-render stores (screen = pure projection,
  `state` version triggers render). Why: decouples React composition from domain
  state — see the `react-model-render` skill and
  `packages/ndx/docs/internals.md`.

Agent domain contracts: `packages/ndx/src/agent`. Doc-site drift guard:
`src/documents_front/audit.mjs`.
