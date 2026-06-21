# Usage

Use `npm run deploy` from the repository root to install-check, build, and start
`agent` through Docker Compose.

`scripts/deploy.sh` loads the host-platform base image through
`apps/ndx/docker/baseImage/load-file-image.sh` before building
`apps/ndx/docker/Dockerfile`. On Apple Silicon the loader selects the
`linux/arm64` archive; on x64 hosts it selects `linux/amd64`.

Default local Docker ports:

* agent web client and API server: `http://127.0.0.1:18082`
* session socket health: `http://127.0.0.1:18082/api/session/health`
* session socket path: `ws://127.0.0.1:18082/session`

The web client translations live in `apps/ndx/assets/i18n/*.json` for bundled
defaults. Runtime overrides live under `/ndx/.ndx/i18n/*.json`, backed by the
repository `volume/.ndx/i18n` directory. Express serves `/assets/i18n` from
`/ndx/.ndx/i18n` first, then falls back to bundled image assets.

The root runtime volume contract is documented in `../../docs/runtime-volume.md`.
