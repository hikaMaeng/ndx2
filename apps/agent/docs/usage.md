# Usage

Use `npm run deploy` from the repository root to install-check, build, and start
`agent` through Docker Compose.

Default local Docker ports:

* agent web client and API server: `http://127.0.0.1:18082`
* session socket health: `http://127.0.0.1:18082/api/session/health`
* session socket path: `ws://127.0.0.1:18082/session`

The web client translations live in `apps/agent/assets/i18n/*.json` for bundled
defaults. Runtime overrides live under `/ndx/assets/i18n/*.json`, backed by the
repository `volume/assets` directory. Express serves `/assets` from `/ndx/assets`
first, then falls back to the bundled image assets.

The root runtime volume contract is documented in `../../docs/runtime-volume.md`.
