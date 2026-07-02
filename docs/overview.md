# Overview

`ndx2` is a TypeScript Turbo monorepo for a web-service-centered coding agent.

The product is not a mechanical port of another agent implementation. The runtime, package boundaries, deployment shape, and UI surfaces must fit this repository's TypeScript monorepo architecture.

The server product has four durable responsibilities:

* Agent session server: maintains coding sessions and interacts with clients over WebSocket.
* Settings surface: exposes runtime, model, skill, and hook settings through the webclient settings area.
* Session web client: provides a browser interface for sessions and settings alongside possible CLI, editor, or native clients.
* Documents site: exposes runtime and operation documentation from the same service.

The service is deployed from `apps/ndx`. Shared domain contracts live in `packages/ndx` under `src/common`, `src/agent`, and `src/webclient`. Domain behavior is documented here before implementation so future code can follow stable contracts instead of inferring product design from scaffold placeholders.

The runtime datastore is PostgreSQL inside the agent container. Local app builds
start from a file-backed base image produced by
`apps/ndx/docker/baseImage/Dockerfile` and
`apps/ndx/docker/baseImage/build-file-images.sh`; npm release builds use
`npm/Dockerfile` to create one final distribution image. PostgreSQL exposes no
host port and stores data under `./volume/pgvector`, inside the ndx root volume.
