# npm Release Policy

The GitHub repository remains the clone-and-build source project. The npm
package is a separate Docker-backed distribution surface under `npm/`.

Images are published to GitHub Container Registry, not to git history. Local
developer builds use archive-backed base images so app image rebuilds do not
pull a registry base on every deploy.

## Package Shape

`npm/package.json` publishes `@ndevai/ndx2` with the `ndx2` binary. The CLI
uses Node built-ins only and controls a generated compose file at
`~/.ndx2/docker-compose.yml`.

The npm package is intentionally not part of the root Yarn workspaces. It is a
release wrapper, not a monorepo runtime package.

## Runtime Flow

1. `ndx2` checks Docker, Docker daemon availability, and Docker Compose v2.
2. If `~/.ndx2/npm-install.json` exists, it starts the saved compose stack and
   prints the local Agent URL.
3. If initialization state does not exist, it asks for the ndx root volume path,
   defaulting to the current directory.
4. It writes a GHCR image-based compose file with the selected volume and
   free host ports in the scaffold port range.
5. It records initialization state so later `ndx2` runs skip setup.
6. `ndx2 uninstall` runs compose down and removes the npm initialization state.

The selected ndx root volume remains on disk after uninstall so user data is not
deleted by a package command.

## Local Base Image Contract

`apps/ndx/docker/baseImage/Dockerfile` is the source for the local base image.
It contains PostgreSQL/pgvector/Korean text search plus Node, Docker CLI,
Chromium, Playwright, and shell-tool runtime libraries.

`apps/ndx/docker/baseImage/build-file-images.sh` writes Docker archive files:

| File | Platform | Consumer |
| --- | --- | --- |
| `apps/ndx/docker/baseImage/out/ndx2-ndx-base-<version>-linux-amd64.tar` | `linux/amd64` | x64 Docker hosts. |
| `apps/ndx/docker/baseImage/out/ndx2-ndx-base-<version>-linux-arm64.tar` | `linux/arm64` | Apple Silicon and ARM Docker hosts. |

`apps/ndx/docker/baseImage/load-file-image.sh` detects the Docker server
architecture, builds the matching archive if missing, loads it, and tags it as
`ndx2-ndx-base:<version>`. `scripts/deploy.sh` runs this loader before building
`apps/ndx/docker/Dockerfile`.

`apps/ndx/docker/Dockerfile` must stay thin: it starts from
`ndx2-ndx-base:<version>` and copies prebuilt `apps/ndx/dist`, assets, base
tools, init assets, and the entrypoint only.

## npm Single Image Contract

Every npm version must have a matching public GHCR final agent tag before npm
publish:

* `ghcr.io/hikamaeng/ndx2-agent:<version>`

The npm launcher must reference only this final agent image. `npm/Dockerfile`
builds that final image directly and must not consume
`apps/ndx/docker/baseImage/out/*.tar`; npm users pull one image and never need
the local file-image cache.

The final GHCR tag must be a multi-platform manifest for `linux/amd64` and
`linux/arm64`. Do not publish an npm version that points at an image that is
missing, private, single-architecture, or still mutable.

GHCR public packages are the default because public packages support anonymous
pulls and avoid Docker Hub search/rate-policy coupling. If Docker Hub later
becomes the preferred mirror, it may be added as a secondary registry only after
the same version/tag immutability rules are met.

## Release Order

1. Update `npm/package.json` to the release version.
2. Run `bash apps/ndx/docker/baseImage/build-file-images.sh` when the local
   base archive files must be refreshed for clone-and-build development.
3. Run `bash apps/ndx/docker/publish-ghcr.sh` with an existing `docker login
   ghcr.io` session, or with `GHCR_TOKEN`, to build `npm/Dockerfile` and push
   `ndx2-agent:<version>`.
4. Run `npm --prefix npm run check`.
5. Publish from `npm/` to npmjs. Do not publish to Verdaccio for public
   releases.

This keeps source pushes and npm distribution separate: GitHub users can clone
and build, while npm users receive a Docker-only launcher.

## GitHub Actions

`Publish GHCR Images` builds and pushes the `linux/amd64,linux/arm64` agent
image to GHCR. It runs on `v*` tags or manual dispatch.

`Publish npm Package` is manual. It verifies that the agent GHCR image tag
exists before publishing `npm/` to npmjs. Store the npm
automation token as the repository secret `NPM_TOKEN`; never commit npm tokens
to this repository.
