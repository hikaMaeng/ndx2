# API

Service APIs are owned by each module under `apps/*`.

Current scaffold endpoints:

| Service | Endpoint | Purpose |
| --- | --- |
| `admin` | `GET /health` | Admin service health |
| `admin` | `GET /api/health` | Admin API health |
| `agent` | `GET /health` | Agent service health |
| `agent` | `GET /api/health` | Agent API health |
| `agent` | `GET /api/agent` | Agent web metadata including session URLs on the same origin |
| `agent` | `GET /api/agent/web-client-state?clientid=<uuid>` | PostgreSQL-backed browser state restore |
| `agent` | `PUT /api/agent/web-client-state` | PostgreSQL-backed browser state update |
| `agent` | `GET /api/agent/web-projects` | List web-client project registrations |
| `agent` | `POST /api/agent/web-projects` | Register a project path and persisted project identity |
| `agent` | `GET /api/agent/projects/:projectid/sessions` | List project sessions |
| `agent` | `POST /api/agent/projects/:projectid/sessions` | Create a project session |
| `agent` | `GET /api/agent/sessions/:sessionid/data` | Inspect ordered durable session history |
| `agent` | `POST /api/agent/sessions/:sessionid/messages` | Persist a user request in session history |
| `agent` | `POST /api/agent/sessions/:sessionid/interrupt` | Persist a session interrupt record |
| `agent` | `GET /api/session/health` | Session surface health |
| `agent` | `WS /session?clientid=<uuid>` | Agent session socket |

Target API surfaces:

| Surface | Transport | Contract owner |
| --- | --- | --- |
| Session stream | WebSocket | Agent server session surface |
| Account management | HTTP API | Account server |
| Admin operations | HTTP API plus web UI | Admin server |
| History restoration | HTTP API or WebSocket request-response | Agent server session surface |

Session socket clients submit a UUID `clientid` query parameter during the WebSocket upgrade. The agent server rejects missing, invalid, or currently connected duplicate client ids.

Connection setup is ordered:

1. Server sends `account.selection.required` with selectable `users`.
2. Client sends `account.select` with `userid`.
3. Server sends `account.selected`, then `project.negotiation.required`.
4. Client sends one `project.configure` message with `projectId` and absolute `projectPath`.
5. Server sends `project.negotiated`, then `session.ready`.

Until account selection completes, the server ignores all other work and repeats `account.selection.required`. Until project negotiation completes, the server requires `project.configure`.

After `session.ready`, clients enter a session with `session.attach`, including
`userid`, `projectId`, `projectPath`, and `sessionid`. The server verifies the
account, project identity, and session ownership, then returns
`session.attached` with a runtime `connectionToken`.

`session.input` and `session.interrupt` messages are accepted only with a valid
`connectionToken` issued on the same physical socket. Accepted messages are
written to PostgreSQL `sessiondata` and acknowledged with `session.event`.
Project session-list actions also use the socket: `session.rename` updates the
session title and replies with `session.renamed`, while `session.delete` removes
the session and replies with `session.deleted`. Both actions broadcast
`session.list.changed` to clients owned by the same account.

`GET /api/agent/sessions/:sessionid/data` remains an HTTP inspection endpoint
for durable `sessiondata` rows. Browser session rendering restores history over
the socket with staged requests: `session.history.summary` returns only visible
user/final assistant events and collapsed turn shells; `session.turn.detail`
returns iteration card summaries for one turn; `session.iteration.detail`
returns renderable events for one completed iteration. The client feeds both
live stream events and staged detail events through the same turn reducer.

Tool progress events may carry client-renderable right-sidebar items without
changing the `session.event` message type. The progress `message` starts with
`${SIDEBAR_ITEM}`, and `contents.event.data.sidebarItem` contains one item with
a flat `group` card selector, `title`, and optional `body`. The web client
creates a card for a missing group and appends or replaces items inside an
existing group by item key. Built-in `read_file` emits `파일참조`, `loadSkill`
emits `스킬`, and changed write/edit results emit `변경 파일`; legacy artifact
turn-card markers still parse as `파일` sidebar items for compatibility.

The socket server sends WebSocket ping frames every 20 seconds. Ten consecutive missed pongs terminates the client connection.

Detailed semantics are in `sessions.md`, `session-data.md`, and `runtime-control.md`.
