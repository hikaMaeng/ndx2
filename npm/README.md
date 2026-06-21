Docker-backed npm launcher for ndx2.

| Goal | File |
| --- | --- |
| Understand purpose | [README.md](README.md) |
| API reference | [docs/api.md](docs/api.md) |
| Constraints | [docs/constraints.md](docs/constraints.md) |
| Testing | [docs/testing.md](docs/testing.md) |

# @ndevai/ndx2

```sh
npm install @ndevai/ndx2
npx ndx2
```

or install globally:

```sh
npm install -g @ndevai/ndx2
ndx2
```

Without a prior install:

```sh
npx @ndevai/ndx2
```

The CLI does not build the local repository. It writes a dedicated Docker
Compose file under `~/.ndx2/docker-compose.yml`, records initialization state in
`~/.ndx2/npm-install.json`, and starts GHCR images for the selected npm
package version.

## Commands

`ndx2` initializes once, starts the Docker Compose stack, and prints the local
Agent URL.

`ndx2 uninstall` removes the npm initialization flag, the generated compose
file, and the ndx2 Docker Compose stack. It does not delete the selected ndx
root volume directory.

## Release Contract

For each npm package version, publish matching public GHCR tags first:

* `ghcr.io/hikamaeng/ndx2-agent:<version>`

The npm compose template pulls only this final agent image. `npm/Dockerfile`
builds it as one distribution image and does not depend on local base-image
archive files.

Only after the GHCR tag is public, multi-architecture, and immutable should
`@ndevai/ndx2@<version>` be published to npmjs.
