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
persists those events to PostgreSQL and replies with `session.event`.
Project session-list actions use `session.rename` / `session.renamed` and
`session.delete` / `session.deleted`; successful changes broadcast
`session.list.changed` so browser project lists can refresh.

Session history is staged over the same socket after `session.attach` returns a
connection token:

* `session.history.summary` / `session.history.summary.result` returns visible
  user/final assistant events and collapsed turn shells.
* `session.turn.detail` / `session.turn.detail.result` returns the iteration
  card summaries for one turn.
* `session.iteration.detail` / `session.iteration.detail.result` returns the
  stored renderable events for one completed iteration.

`assistant.tool_progress` may include right-sidebar item payloads. The client
recognizes marker-prefixed progress messages such as `${SIDEBAR_ITEM}`, then
uses `contents.event.data.sidebarItem` to render one flat sidebar category as a
card. `sidebarItem.group.id` selects the card, `group.title` names it, and each
item renders from a `title` plus optional `body`. Built-in `read_file` renders
as `파일참조`, `loadSkill` renders as `스킬`, and changed write/edit results render
as `변경 파일`. Legacy `${TURNCARD_SKILL}` and `${TURNCARD_ARTIFACT}` payloads
are still mapped into sidebar groups for compatibility.

The server pings every 20 seconds and terminates a client after 10 consecutive missed pongs.
