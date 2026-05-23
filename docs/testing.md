# Testing

Scaffold verification uses `agenttest` JSON reports under `test/YYYYMMDD/` plus smoke checks against the deployed server.

Current scaffold tests cover admin and agent health endpoints, the agent session health placeholder, and deploy smoke behavior.

Future implementation tests must cover:

* account creation, default `ndev` behavior, optional passwords, immutable names, and deletion cascade;
* project identity by `target + path`, then session identity by account plus project id plus session id;
* WebSocket connection, history restoration, downstream event ordering, and duplicate-event suppression by id;
* task-turn context reconstruction from PostgreSQL without relying on in-memory live-session state;
* crash recovery and resumable task-turn markers;
* interrupt propagation to the agent loop, local tools, remote MCP tools, and subagents;
* queued work after an active turn completes;
* mid-turn interjection after an active tool finishes.

Frontend browser tests must use documented landmarks, accessible names, and stable test ids from `docs/constraints.md` or the owning app package docs.
