# npm Release Policy

The GitHub repository remains the clone-and-build source project. The npm
package is a separate Docker-backed distribution surface under `npm/`.

Images are published to GitHub Container Registry, not to git history. GHCR is
the repository-linked Packages storage for container layers and manifests.

## Package Shape

`npm/package.json` publishes `@neurondev/ndx2` with the `ndx2` binary. The CLI
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

## Image Contract

Every npm version must have a matching public GHCR runtime tag before npm
publish:

* `ghcr.io/hikamaeng/ndx2-agent:<version>`

The agent image is built from the separately managed pgvector base image:

* `ghcr.io/hikamaeng/ndx2-pgvector:<version>`

Each tag must be a multi-platform manifest for `linux/amd64` and `linux/arm64`.
The npm compose template must reference the exact agent version tag. Do not
publish an npm version that points at images that are missing, private, or still
mutable.

GHCR public packages are the default because public packages support anonymous
pulls and avoid Docker Hub search/rate-policy coupling. If Docker Hub later
becomes the preferred mirror, it may be added as a secondary registry only after
the same version/tag immutability rules are met.

## Release Order

1. Run `bash pgvector/publish-ghcr.sh` when the pgvector base image must be
   created or refreshed for the target version.
2. Build and push the agent GHCR image for the target version.
3. Update `npm/package.json` to the release version.
4. Run `npm --prefix npm run check`.
5. Publish from `npm/` to npmjs.

This keeps source pushes and npm distribution separate: GitHub users can clone
and build, while npm users receive a Docker-only launcher.

## GitHub Actions

`Publish GHCR Images` builds and pushes the `linux/amd64,linux/arm64` agent
image to GHCR. It runs on `v*` tags or manual dispatch.

`pgvector/publish-ghcr.sh` publishes the slow pgvector base image from local
source after prompting for GHCR credentials. The script does not store tokens.

`Publish npm Package` is manual. It verifies that the agent and pgvector GHCR
image tags exist before publishing `npm/` to npmjs. Store the npm automation token as the
repository secret `NPM_TOKEN`; never commit npm tokens to this repository.
