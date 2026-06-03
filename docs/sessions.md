# Sessions

A coding agent runs only inside a session.

Session identity is scoped by:

| Part | Meaning |
| --- | --- |
| Account | User account that owns the session |
| Project id | UUIDv7-shaped id resolved from the server `project` table |
| Session id | Unique session id within the account and project category |

Session metadata records properties about the session itself:

* immutable account owner (`userid`);
* project id;
* UUIDv7-shaped session id;
* title, initially empty and then derived from the first user request unless renamed;
* last mode (`none` or `light`);
* model config JSON (`NDXModelConfig` shape: `type`, `model`, `url`, `token`, `contextsize`, optional `modalities`);
* last interaction time (`lastupdated`);
* physical project root path;
* idle or active state (`isrunning`);
* task-turn recovery state.

Project identity is stored in PostgreSQL. The canonical key is `target + path`
in the `project` table; the current runtime only accepts `local` as `target`.
The server does not create or trust `/.ndx/.projectid` files.

Context history records the conversation and execution stream:

* user requests;
* user image/file attachment references stored as project-home paths, never binary database values;
* model responses;
* tool-call requests;
* tool execution logs and results;
* interruption records;
* final responses.

`sessionsearch` is a derived search projection of that history. It is not the
source of truth and does not replace `sessiondata`; it exists so the agent can
search prior sessions through `session_history`. The table stores only user
request bodies and final assistant answer bodies, keyed by the original
`dataid`, so clients and context reconstruction still read canonical history
from `sessiondata`.

The session server is a multi-user socket server. Multiple clients may connect to the same session. The server streams downstream events from agent execution to every connected client that is authorized for the session.

A physical WebSocket connection may hold multiple runtime session grants. When
a client opens a session view, it sends a session attach request and receives a
connection token for that session. All later session actions on that socket use
the token, so one physical socket can carry independent sessions across
accounts and projects. Tokens are runtime grants only; clients forget them on a
fresh site load and request new tokens.

Function tools may use the active session grant to ask connected clients for
structured input. `askUserQuestion` sends `session.client.request` to every
currently connected client with a grant for that session, and the first valid
`session.client.response` resolves the tool call. Clients without a grant cannot
answer even if they can see the project or account in their browser state. If
the browser disconnects before answering, a later attach for the same session
receives the pending request again. Once the request is answered, cancelled, or
interrupted, the server sends `session.client.request.closed` to attached
clients so stale dialogs are dismissed.

`session_history` is also a function tool, but it is read-only and does not
require a connected browser grant. The current session supplies default
`session` and `project` scopes; explicit ids may widen or narrow the search.
The `all` scope searches every session stored in the same PostgreSQL/pgvector
datastore.

The session web client is separate from the socket server. It manages its own
project menu state and then connects to the socket server with a selected
`userid`, workspace child-folder `projectName`, and model config. Model selection is
rendered from the web client's provider/model tables, but the socket server
still only receives the final `NDXModelConfig` payload. The socket server owns
agent execution; the web client only requests session lists, creates sessions,
selects accounts, and opens socket connections.

OpenAI-compatible `/models` responses do not provide a portable guarantee for
input modality support. NDX therefore treats `modalities` as local model
metadata. A model without explicit `image` or `file` support is treated as
text-only even if the provider may support multimodal input.

Project paths are normalized by the session server. Host paths under
`NDX_HOST_ROOT` map to `/ndx`. The container workspace root and user home are fixed
at `/ndx/workspace` and `/ndx`; clients must not negotiate alternative container
roots. See `runtime-volume.md` for volume path ownership.

Clients do not own session truth. If a client has no prior messages, it requests history restoration. After restoration, it appends only messages whose ids are not already present locally.

## Skill Mentions

The session web client may request the current project's skill list over the
session socket with `session.skill.list`. The socket server resolves skills from
the same user, repo, plugin, system, and `.skillignore` rules used by the model
context builder.

The composer renders `$` skill mentions with a textarea-backed mention control.
Internally selected skills are sent in the user request as
`[[NDX_SKILL_<encoded-name>]]` markers. The server must not store those markers
as user-visible history. The `turn.request.received` system hook consumes the
markers before the user message is appended:

* if the selected skill is not already present in the current model context, the
  hook runs the normal `loadSkill` base tool and records its `<skill>...</skill>`
  output as a `skill_context` row;
* the user request is rewritten back to display text such as `$agenttest`;
* the normal turn flow then reconstructs model context from `sessiondata`.

This keeps PostgreSQL `sessiondata` as the context source of truth while avoiding
an extra model-requested `loadSkill` iteration for explicitly selected skills.
`skill_context` rows are exposed to the model as user-role context messages, not
as `function_call_output`, because no preceding model tool call exists for a
preloaded skill.

The session web client renders only the active session it has joined. Selecting
another project or session clears the current chat, turn-flow state, context
usage, and staged-detail request cache before the new session is attached and
rendered.

Chat scrolling defaults to auto-scroll-to-bottom. User scroll, touch, or pointer
interaction pauses auto-scroll; the client returns to auto-scroll mode after
five seconds and shows a small gray status indicator at the upper-right of the
chat viewport.

## Chat Sessions

Chat sessions are a separate session class for non-project chat. They are
scoped by account, chat folder, and chat session id. There is no persisted
folderless chat session; the root folder exists from the first chat list read
and is the initial folder for every account.

Opening a new chat from a folder creates only a client draft. The server creates
the real `chatsession` row when the first message is sent with an explicit
model config. This mirrors project session drafts while keeping chat sessions
from the workspace folder name.

Chat sessions share durable history, model streaming, tool-call recording, and
PostgreSQL reconstruction patterns with project sessions, but they use a
chat-specific context builder and a chat-specific tool allowlist. The web client
may display chat folders and open chat drafts, but it does not own the chat turn
loop or write access policy.
