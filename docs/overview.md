# Overview

`ndx2` is a TypeScript Turbo monorepo for a web-service-centered coding agent.

The product is not a mechanical port of another agent implementation. The runtime, package boundaries, deployment shape, and UI surfaces must fit this repository's TypeScript monorepo architecture.

The server product has four durable responsibilities:

* Agent session server: maintains coding sessions and interacts with clients over WebSocket.
* Administrator site: exposes session management, settings, logs, and server state.
* Session web client: provides a browser interface for a session, alongside possible CLI, editor, or native clients.
* Account-management server: creates, removes, and authenticates user accounts.

The scaffold now separates deployable services into `apps/admin` and `apps/agent`. Shared domain contracts live in `packages/ndx` under `src/common`, `src/admin/*`, and `src/agent/*`. Domain behavior is documented here before implementation so future code can follow stable contracts instead of inferring product design from scaffold placeholders.

The runtime datastore is a compose-local PostgreSQL service named `pgvector`, built from `./pgvector/Dockerfile.pgvector` and configured with default credentials `ndev/ndev`. The container exposes no host port and stores data under `./pgvector/data`.
