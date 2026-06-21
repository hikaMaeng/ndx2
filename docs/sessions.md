# Sessions

A coding agent runs only inside a session.

Session identity is scoped by:

| Part | Meaning |
| --- | --- |
| Project name | Direct child folder name under `/ndx/workspace` |
| Session id | Unique session id |

Session metadata records properties about the session itself:

* UUIDv7-shaped session id;
* title, initially empty for empty sessions and derived from the first user request
  when an initial request exists unless renamed;
* last mode (`none` or `light`);
* model config JSON (`NDXModelConfig` shape: `type`, `model`, `url`, `token`, `contextsize`, optional `modalities`, optional `reasoningEffort`);
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

The session server may serve multiple browser clients. Multiple clients may connect to the same session. The server streams downstream events from agent execution to every connected client that has attached that session on its socket.

A physical WebSocket connection may hold multiple runtime session grants. When
a client opens a session view, it sends a session attach request. The server
records that `sessionid` in the socket-local grant set. All later session
actions on that socket carry the `sessionid`, so one physical socket can carry
independent sessions across projects. Grants are runtime-only;
clients receive no separate token and must attach again on a fresh site load.

Function tools may use the active session grant to ask connected clients for
structured input. `askUserQuestion` sends `session.client.request` to every
currently connected client with a grant for that session, and the first valid
`session.client.response` resolves the tool call. Clients without a grant cannot
answer even if they can see the project in their browser state. If
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
project menu state and then connects to the socket server with a workspace
child-folder `projectName` and model config. Model selection is
rendered from the web client's provider/model tables, but the socket server
still only receives the final `NDXModelConfig` payload. The socket server owns
agent execution; the web client only requests session lists, creates sessions,
and opens socket connections.

When an existing session receives `session.input` with a model config, the
socket server treats that config as the session's new active model for the turn.
It updates PostgreSQL `session.model` before reconstructing context or calling
the provider, so model name, endpoint, context size, and `reasoningEffort` take
effect for that request and later turns.

All session-history mutations use the session socket protocol, not web-only HTTP
routes. A client with a session grant may request `session.turn.delete` for a
specific user input `dataid`, or `session.branch.create` to create a new session
from history through that turn. The same commands are the contract for the web
client and any future CLI client. The socket server rejects both operations
while the source session is running, compacting, interrupting, or carrying a
pending interrupt request.

`session.branch.create` copies the source session project, mode, and
model config, creates a new session, and then stores one initial `compact`
`sessiondata` row summarizing source history through the selected turn. The new
session title is the selected user request title with a leading `🚩`. The
requesting socket receives a grant for the new session before the
`session.branch.created` response is sent. Because branch compaction can be
slow, `session.branch.created` may be sent with `compactStatus: "running"`
before the initial `compact` row exists; the socket then emits
`turn.compact.started` and `turn.compact.completed` events for the new session.
If the compact model request fails, the branch session is not deleted. Instead
the socket emits `turn.failed` on the new session and records an assistant
`error` row explaining that prior-history compaction failed.

For a new project session with a first request, the browser sends that request
inside `session.create.initialInput`. The socket server validates the target
project, model, attachments, session row, and session token before it
emits `session.created`. That message carries the token, the first-request
title, and `initialInputAccepted`; the web client must promote its draft surface
to the returned session without sending a second `session.input`. The server
then starts the turn from that accepted initial input.

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
context builder. Existing sessions should request by `sessionid`; draft session
surfaces that do not have a `sessionid` yet may include `projectName` so the
server can resolve repository-local skills for the selected workspace project
before the first session row exists.

Repository-local skill discovery includes both `<projectHome>/.codex/skills`
and `<projectHome>/.ndx/skills`, plus matching repo plugin skill roots. This
keeps source-repository skills and scaffolded/runtime project skills visible to
the same `loadSkills` path. Adjacent skill `.cache` metadata is valid only while
the matching `SKILL.md` size and mtime are unchanged.

The composer renders `$` skill mentions with a textarea-backed mention control.
Internally selected skills are sent in the user request as
`[[NDX_SKILL_<encoded-name>]]` markers. The server must not store those markers
as user-visible history. The `turn.request.received` system hook consumes the
markers before the user message is appended:

The composer refreshes the visible skill suggestions through
`session.skill.list` instead of reusing a project-level frontend cache. A
successful refresh request clears the current composer suggestions until the
socket response arrives, and the response updates only the currently active
composer surface.

* if the selected skill is not already present in the current model context, the
  hook runs the normal `loadSkill` base tool and records a selected-skill
  instruction plus the `<skill>...</skill>` output as a `skill_context` row;
* if the selected skill is already present in the current model context, the hook
  records only a short selected-skill instruction row for the current request and
  does not rewrite the older skill row;
* when a line contains one selected-skill marker followed by whitespace, the
  rest of that line is preserved as the skill argument in both the selected-skill
  instruction and display text, so `[[NDX_SKILL_cot-solve]] --min-steps 20`
  becomes `$cot-solve --min-steps 20` and the loaded skill can apply the full
  `--min-steps 20` argument;
* the user request is rewritten back to display text such as `$agenttest`;
* the normal turn flow then reconstructs model context from `sessiondata`.

This keeps PostgreSQL `sessiondata` as the context source of truth while avoiding
an extra model-requested `loadSkill` iteration for explicitly selected skills and
making the selected workflow mandatory before the first model iteration.
`skill_context` rows are exposed to the model as user-role context messages, not
as `function_call_output`, because no preceding model tool call exists for a
preloaded skill.

Selected-skill rows are prompt-prefix-cache sensitive. They must be appended as
durable `sessiondata` rows before the current user message and must not be
inserted through temporary `turn.context.prepared` message splicing. If a skill is
selected again after its body is already present in history, append a new short
selected-skill instruction for the current request instead of editing the older
`skill_context` row. This preserves the previous model request byte-for-byte as
the prefix of later model requests while still making the selected workflow
mandatory for the current request.

The session web client keeps an in-memory model for every project session or
draft surface it has created or entered during the current browser lifetime.
Selecting another project or session changes the active rendered model, but it
does not clear already-created session models. A non-active session may continue
to receive socket events, history restoration, running-turn updates, streaming
assistant text, sidebar items, and detail-expansion results. Those updates are
applied to that session's model and become visible when the session is selected
again.

Each model is keyed by `sessionid` for durable sessions and by
`draft:<projectName>` for a new-session draft. When a draft's first request
creates the real session, the web client promotes the draft model to the
returned `sessionid` instead of creating a separate empty model. The promoted
model preserves composer state, pending request state, scroll/sidebar state,
and any optimistic runtime state that belongs to the request.

Session socket routing is model-first. Downstream messages that identify a
session are routed by session token or session id to an existing in-memory
session model. If no matching model exists, the web client ignores the message
instead of creating a hidden authoritative state holder. This keeps the browser
model cache scoped to sessions the UI intentionally entered while PostgreSQL
remains the server-side source of truth.

The model stores history in three levels:

1. visible user requests and final assistant responses;
2. turn summaries and iteration summaries used for completed blocks;
3. iteration details loaded on demand when the user expands a specific
   iteration.

Rendering is a projection of the active model. Running turns, assistant
streaming, context usage, interruption status, cot-work state, completed block
expansion, and right-sidebar content first update the model, then React renders
from the updated snapshot. DOM-only adjuncts such as actual `File` handles,
object URLs, element refs, and modal open state may remain in app-local React
state, but canonical per-session history/runtime/sidebar state belongs to the
session model.

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
