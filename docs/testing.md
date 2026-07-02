# Testing

Scaffold verification uses `agenttest` JSON reports under `test/YYYYMMDD/` plus smoke checks against the deployed server.

Current scaffold tests cover service health endpoints, the agent session health placeholder, document serving, and deploy smoke behavior.

Future implementation tests must cover:

* absence of product account ownership: no account-selection socket path, no `userid` session ownership, and no user-owned filters;
* project identity by workspace project name, then session identity by project name plus session id;
* WebSocket connection, history restoration, downstream event ordering, and duplicate-event suppression by id;
* task-turn context reconstruction from PostgreSQL without relying on in-memory live-session state;
* crash recovery and resumable task-turn markers;
* interrupt propagation to the agent loop, local tools, remote MCP tools, and subagents;
* queued work after an active turn completes;
* mid-turn interjection after an active tool finishes.

Frontend browser tests must use documented landmarks, accessible names, and stable test ids from `docs/constraints.md` or the owning app package docs.

Scaffolded web projects include a repository-local `headless-browser-test` skill
for running Chromium/Playwright checks against Docker-deployed services. The
ndx2 agent image owns the browser runtime; project skills should focus on the
test URL, user-visible scenario, report, and screenshots rather than dependency
installation.
