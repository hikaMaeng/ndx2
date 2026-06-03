# Architecture

The CLI uses Node built-ins only. It checks Docker and Docker Compose v2, stores
initialization state in `~/.ndx2/npm-install.json`, and controls
`~/.ndx2/docker-compose.yml`.

The compose stack uses one public GHCR runtime image:

* `ghcr.io/hikamaeng/ndx2-agent:<version>`

The agent image is built from the prebuilt PostgreSQL base image:

* `ghcr.io/hikamaeng/ndx2-pgvector:<version>`
