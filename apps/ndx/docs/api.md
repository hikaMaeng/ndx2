# API

Agent server (`PORT`) endpoints:

* `GET /health` and `GET /api/health` return agent service health.
* `GET /api/agent` returns agent version plus same-origin session health and socket URLs for the browser client.
* `GET /api/agent/web-client-state?clientid=<uuid>` restores browser client state from PostgreSQL.
* `PUT /api/agent/web-client-state` persists normalized browser client state.
* `GET /api/agent/web-projects` lists direct child folders under the workspace as projects.
* `POST /api/agent/web-projects` creates a new direct child folder under the workspace.
* `GET /api/agent/projects/:projectName/sessions` lists sessions for a project and user.
* `POST /api/agent/projects/:projectName/sessions` creates a PostgreSQL-backed session.
* `GET /api/agent/sessions/:sessionid/data` restores ordered `sessiondata` history.
* `POST /api/agent/sessions/:sessionid/messages` records a user request in `sessiondata` and updates turn lifecycle metadata.
* `POST /api/agent/sessions/:sessionid/interrupt` records an interrupt event in `sessiondata`.
* `GET /api/session/health` returns session-surface health.
* `WS /session?clientid=<uuid>` is the session socket. Missing, invalid, or duplicate connected `clientid` values are rejected during upgrade.

Initial socket setup:

1. Server sends `account.selection.required` with `users`.
2. Client sends `account.select`.
3. Server sends `project.negotiation.required`.
4. Client sends one `project.configure` with `projectName`.
5. Server sends `session.ready`.

After `session.ready`, the socket accepts `session.input` and `session.interrupt`
messages for sessions owned by the negotiated account and project. The server
persists durable turn events to PostgreSQL and replies with `session.event`.
Ephemeral right-sidebar items use the separate `session.sidebar.item` socket
message and are not reconstructed from turn or iteration events.
Project session-list actions use `session.rename` / `session.renamed` and
`session.delete` / `session.deleted`; successful changes broadcast
`session.list.changed` so browser project lists can refresh.

Session history is staged over the same socket after `session.attach` returns
`session.attached`:

* `session.history.summary` / `session.history.summary.result` returns visible
  user/final assistant events and collapsed turn shells.
* `session.turn.detail` / `session.turn.detail.result` returns the iteration
  card summaries for one turn.
* `session.iteration.detail` / `session.iteration.detail.result` returns the
  stored renderable events for one completed iteration.

Tools emit right-sidebar items through the executor agent-call envelope:
`[[ndx-agentcall:{"type":"ndx.agentcall","name":"session.sidebar_item","input":...}]]`.
The tool runner parses this envelope before normal tool progress/result parsing,
validates `input` as one sidebar item, and the session server sends a dedicated
`session.sidebar.item` message to the web client. Tool processes and function
tools do not handle WebSocket transport directly. `item.group.id` selects the
card, `group.title` names it, and each item renders from a `title` plus optional
`body`. Items may include `subgroup: { id, title }`; the web client renders
those items under a second-level heading inside the section, while omitted or
blank subgroup data renders the item at the section top level. Client rendering
deduplicates identical explicit item keys inside a section, so the same changed
file sent across multiple iterations is shown once. Built-in tools render into
stable groups: `read_file` as `파일참조` with folder subgroups, `loadSkill` as `스킬`,
`write_file`/`edit` as `변경 파일` with folder subgroups, `bash` as `명령 실행`
with first-command-word subgroups,
`glob` as `파일 검색`, `grep_search` as `텍스트 검색`, `getImage` as `이미지`,
`cot_work` as `작업 계획`, web tools as web reference/search groups, and
function tools as their matching interaction/history groups. Legacy
`${SIDEBAR_ITEM}`, `${TURNCARD_SKILL}`, and `${TURNCARD_ARTIFACT}` progress
payload parsers remain in common protocol only for compatibility; live
right-sidebar delivery uses `session.sidebar.item`.

The server pings every 20 seconds and terminates a client after 10 consecutive missed pongs.
