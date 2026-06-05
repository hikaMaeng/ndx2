# Session Data

PostgreSQL is the source of truth for all session data.

The server must not maintain a separate authoritative live-session object in memory. Runtime memory may cache, assemble, or stream data, but PostgreSQL records decide what a session is and how it resumes.

A task turn is the unit of agent execution:

1. A user request starts the turn.
2. The server records that request in `sessiondata`.
3. The server reconstructs model context from PostgreSQL by placing stable
   base instructions and environment context first, then ordered session
   history, then one-request attachment payloads.
4. The model may emit intermediate text or tool calls.
5. Tool calls execute and write results.
6. The server reconstructs context again for the next model request.
7. The turn ends with a final response, interruption, failure, or resumable state.

Every in-memory model context is temporary. It is destroyed after each model request and must be rebuilt by an invariant function over durable records.
Reconstruction keeps long-lived instructions and environment fields ahead of
durable append-only history so provider prefix caches can reuse the complete
previous request as the next request prefix when no one-request payload is
present.
If a hook writes a model-visible sessiondata row, reconstruction must preserve
that row as model-visible history instead of treating it as a one-request-only
append. One-request-only appends are reserved for provider payload mechanics such
as attachment bytes that are already represented durably by stable references.

This design is required for:

* crash recovery after server process exit;
* task-turn resume after abrupt shutdown;
* multiple clients interacting with the same session;
* deterministic history restoration for clients;
* auditability of tool calls and user-visible responses.

## Database Access and Runtime Use

The canonical development database for session data is PostgreSQL running inside
the agent container.

`initServer` owns schema initialization. When called with `database` or
`databaseUrl`, it verifies/creates the session tables before runtime use.

## Tables

There is no authoritative project table. A project is the name of a direct
child folder under `/ndx/workspace`. The server derives the physical project
root as `/ndx/workspace/<projectName>`.

`session` stores session metadata:

| Column | Contract |
| --- | --- |
| `sessionid` | UUID primary key. Runtime-generated ids are UUIDv7-shaped for index locality. |
| `userid` | Required immutable owner account id. |
| `title` | Starts as `''` for an empty session. When `session.create` carries an initial input, the session row is created with the first input text as title; otherwise the first string `user` history item promotes to title unless already set. |
| `lastupdated` | Updated whenever session metadata or history changes. |
| `mode` | `none` or `light`; default `none`. |
| `projectname` | Workspace direct child folder name. This is the only durable project identity stored on the session row. |
| `model` | JSONB provider config. Current valid provider type is `openai`; model modality support is explicit metadata, not inferred from the provider API. |
| `isrunning` | Agent-loop active/idle flag. |
| `turnphase` | Current server-owned turn phase for interruption and resume coordination. |
| `interruptrequested` | Durable interruption request flag shared across clients and the agent loop. |
| `interruptrequestedat` | First interruption request timestamp for the current active turn. |
| `interruptcompletedat` | Timestamp when the interruption path completed. |
| `runtimedata` | JSONB runtime coordination data. `inlineAttachmentDataIds` stores sessiondata ids whose attachments must be inlined into the next model request. |

`sessiondata` stores ordered conversation and execution history:

| Column | Contract |
| --- | --- |
| `dataid` | Append order key. |
| `sessionid` | Required owner session; cascades on session delete. |
| `type` | Event kind such as `user`, `assistant`, `tool call`, or `tool result`. |
| `contents` | JSONB event payload. Must be an object with a `kind` discriminator, not a bare string. |
| `createdat` | Append timestamp. |

The SQL is maintained as explicit strings in
`packages/ndx/src/agent/session/schema.ts`.

`compact` rows are durable model-visible checkpoints owned by
`packages/ndx/src/agent/compact`. When the context window is close to the
reserved output and average-turn budget, the turn loop summarizes prior
sessiondata into `{ kind: "compact", text, ... }` and appends it to
`sessiondata`. Model context reconstruction then starts at the latest compact
row instead of replaying the whole session. Browser history may still display
older rows, but model prompts use only the compact row and later append-only
rows.

There is no manual history window control. Context reconstruction after a
compact always includes the latest compact row and every later sessiondata row
in append order. This keeps model request prefixes stable for provider KV-cache
reuse; trimming decisions belong to durable compaction, not client-side session
settings.

Compaction can happen before the current user input is recorded. In that case
only previous history is compacted, then the user input is appended normally so
the turn semantics are preserved. If an iteration reaches the limit after tool
results or hook output, compaction is allowed to end the current turn; the turn
loop records a final assistant message explaining that the turn ended because
history was compacted.

`turncontextusage` stores one global aggregate row:

| Column | Contract |
| --- | --- |
| `turncount` | Number of completed turns included in the aggregate. |
| `tokens` | Estimated sessiondata tokens consumed from user input through final assistant row. |
| `avgtokens` | `tokens / turncount`, rounded up. Used as the entry budget for the next turn. |

The table is initialized from existing `sessiondata` during server startup.
After each final assistant row, the built-in `turn.model.responding` hook
launches a detached shell update against PostgreSQL so the model-response path
does not wait for aggregate maintenance.

`sessionsearch` stores the searchable text projection of selected
`sessiondata` rows:

| Column | Contract |
| --- | --- |
| `dataid` | Primary key copied from `sessiondata.dataid`; cascades with the source row. |
| `sessionid` | Copied from `sessiondata.sessionid`; used for session and project narrowing. |
| `type` | Copied from `sessiondata.type`. Current rows are `user` requests and final `assistant` answers. |
| `createdat` | Copied from `sessiondata.createdat`. |
| `text` | Body text only. It does not store the full JSON payload, attachments, tool results, or reasoning. |
| `fts` | Korean full-text `tsvector`, falling back to `simple` only when the Korean config is unavailable. |
| `embedding` | `vector(4096)`. Missing embeddings remain the all-zero vector. |
| `hnsw` | `vector(256)`. Stores the first 256 dimensions of `embedding` for the HNSW cosine index. |
| `tokenlength` | Token count derived from `fts`. |

The turn loop invokes built-in session-search hooks after the durable
`sessiondata` row is written. `turn.request.received` handles the user input
row after the request has been normalized and appended; `turn.model.responding`
handles the final assistant row after the final response has been appended. The
hooks insert only two model-visible row kinds:

1. `user_message` rows written when a user request arrives;
2. `assistant_message` rows written for the final user-facing answer.

The hook first inserts the `sessionsearch` row with the default zero vector.
When `.ndx/settings.json` contains `embeddings.provider` and
`embeddings.model`, it launches a detached Node process to request an
OpenAI-compatible `/embeddings` response and update the row. The full vector is
padded or truncated to 4096 dimensions in `embedding`; the first 256 dimensions
are also written to `hnsw`, and the HNSW index is built only on that reduced
field because pgvector HNSW does not support the 4096-dimensional column. The
turn loop does not await that worker. If no embedding settings or database URL
are available, the zero vector remains and search tools use FTS ranking.

Example:

```json
{
  "embeddings": {
    "provider": "local",
    "model": "text-embedding-3-small",
    "url": "http://127.0.0.1:11434/v1"
  }
}
```

If `url` is omitted, `local` defaults to `http://127.0.0.1:11434/v1` and
`openai` defaults to `https://api.openai.com/v1`. `NDX_EMBEDDINGS_URL` may
override the endpoint for the detached worker and the `session_history` query
embedding path.

## Chat Session Data

Chat sessions use separate PostgreSQL tables because they are not project-owned
coding sessions:

| Table | Contract |
| --- | --- |
| `chatfolder` | User-owned chat folder list. Each user has exactly one `root` folder. |
| `chatsession` | Chat session metadata scoped to `chatfolder`; no `projectid` or project path is stored. |
| `chatsessiondata` | Ordered append-only chat history for the chat turn loop. |

The root chat folder is created by the agent domain before folder lists are
returned. It cannot be renamed or deleted through domain functions. Normal
folder deletion cascades to contained chat sessions and their history.

Chat context reconstruction is separate from project session context
reconstruction. It still preserves the provider prefix-cache shape: stable
developer instructions, stable chat environment prelude, ordered append-only
`chatsessiondata` history, then any one-request payloads. Chat context does not
load project AGENTS instructions, project hooks, or project path environment.

Chat tool authority is allowlist based. Current chat sessions may expose
`cot_work`, `getImage`, `loadSkill`, `glob`, `grep_search`, `read_file`,
`web_fetch`, and `web_search`. `bash`, `edit`, `write_file`, and any tool result
effects that would mutate files are rejected in the tool registry/executor, not
only by prompt instruction.

## Multimodal Attachments

User requests may include file or image attachments from the web chat composer.
The browser sends attachment bytes with the socket request, but PostgreSQL never
stores those bytes. The session socket server writes each attachment under the
project root before it starts the agent turn, then passes the complete user
request text plus attachment references into the turn loop. The turn loop
inserts one `user_message` row that binds the text and attachments together.

`<project-home>/.ndx/sessions/<sessionid>/<uuid>`

The durable `sessiondata.contents` payload records only text plus attachment
references: `{ kind: "user_message", text, attachments }`. Each attachment
reference contains `kind`, `path`, `name`, `mimeType`, and `size`.

During context reconstruction, attachment references remain text placeholders
inside durable history. When an attachment must be sent to the model, the turn
loop appends a separate one-request user message near the end of the model input
with Responses API attachment parts. The durable database row remains path-only.

Images are not inlined into every reconstructed model request.
`session.runtimedata.inlineAttachmentDataIds` owns the sessiondata ids whose
image attachments should be sent as attachment payloads on the next model
request. The initial user input row is added when it has image attachments. The
context prepared hook consumes those ids from PostgreSQL, expands matching late
attachment messages to base64 image URLs, and clears the key in the same
operation. Each image payload is sent once while PostgreSQL remains the source
of truth across clients, and older history rows keep a stable text shape for
prefix-cache reuse.

Tools may return optional structured effects in addition to their normal text
result. A tool effect can request a tool-generated user input row with text and
attachment references, and another effect can request that appended row's image
attachments be inlined on the next model request. The turn loop records the
ordinary `tool_result` first, then merges all tool-generated user input effects
from the same tool batch into one `tool_generated_user_message` row. That row is
durable session data, but it is reconstructed as user-role model input rather
than as a new human turn boundary.

## Interactive Client Tools

`askUserQuestion` is a function tool, not a process-backed base-tool command.
The agent tool executor receives a session client bridge from the turn loop and
uses it to send a `session.client.request` socket message to connected clients
that already hold a grant for the active session. The matching
`session.client.response` resolves the tool call.

The client request itself is runtime coordination, not model-visible history.
The durable model-visible order remains the normal tool sequence:

1. model `tool_call` row for `askUserQuestion`;
2. `tool_result` row containing `{ "answers": ... }`;
3. the next model request reconstructed from PostgreSQL.

Do not add a separate user-role row for the answer. Doing so would make the
model see the same information through two channels and would weaken the
prefix-cache ordering contract. Historical rendering may summarize the
`askUserQuestion` tool call/result pair, but context reconstruction must keep
only the function call output as the model-visible answer.

Pending `askUserQuestion` requests are runtime state for the active turn. They
are not inserted into PostgreSQL as separate history rows. If a client
disconnects and later attaches to the same still-running session, the server
resends the pending `session.client.request`; if the turn is interrupted, the
tool result is recorded as cancelled and no synthetic user answer is added.

`prompt_rewrite` is also a function tool. It runs a compact internal rewrite
loop: the configured rewrite model receives the raw prompt plus a compact
current-session history made only from user requests and final assistant/error
responses, then either returns a pass-through/rewrite result or calls the
existing base file/web tools and the shared `session_history` function
tool for more evidence. Current workspace facts must come from file/search/shell
tools; `session_history` is only for explicit prior-session references or
required prior-session decisions. It must not maintain separate project/session
search mechanisms inside the function tool. Its normal result is one
`tool_result` row
whose JSON output separates
`rewritten_prompt`, `report`, `tool_calls`, `facts`, `assumptions`, and
`ambiguities`.

Do not splice a prompt rewrite result into the stable prelude or into the
middle of existing history. The model-visible order remains normal tool-call
continuation:

1. model `tool_call` row for `prompt_rewrite`;
2. `tool_result` row containing the separated rewrite payload;
3. the next model request reconstructed from PostgreSQL.

Because `prompt_rewrite` intentionally makes internal model requests for a
different purpose, a turn that uses it may sacrifice provider prefix-cache reuse
at the beginning of that rewrite flow. After the tool result is durable,
subsequent reconstruction must still preserve the append-only history order.

`session_history` is a function tool over `sessionsearch`. It supports three
scopes: all NDX sessions, all sessions in one project, and one session. SQL
narrows the scope first, then ranking is applied. With embedding settings, the
tool embeds the query and prioritizes cosine similarity while still exposing
Korean FTS rank. Without embedding settings or when query embedding fails, it
uses `ts_rank_cd` over `fts`. With no query, it lists recent rows in scope.
It is not a repository inspection or code search tool; current files must be
inspected through process tools such as `glob`, `grep_search`, `read_file`,
`edit`, or `bash`.

## Rendering Contract

`sessiondata` rows are the canonical input for both live streaming and later
history restoration. A client that restores a session must first normalize each
row into the same `session.event` shape used by the WebSocket stream, then feed
those events through the same turn reducer used for live socket messages.

The restore path must not render every `sessiondata` row as an independent chat
text bubble. User rows and final assistant/error rows may become chat bubbles;
tool calls, tool results, model request markers, stream deltas, reasoning, and
interrupt metadata are turn events. This keeps reopened sessions visually
equivalent to sessions that are still receiving socket messages while preserving
PostgreSQL as the single source of truth.

The web-client normalization helper is
`packages/ndx/src/webclient/protocol/index.ts#sessionDataToSessionEvent`.

The web client must not fetch full historical turn internals during initial
session attach. After it receives a session connection token, it requests
`session.history.summary` over the session socket. The response contains only
the visible user request and final assistant/error event for each turn plus
collapsed turn shells. When a user expands a turn, the client requests
`session.turn.detail`; that result exposes iteration card summaries. When a
user expands one iteration card, the client requests `session.iteration.detail`
and renders only that iteration's stored events through the same turn reducer
used for live stream events.

This keeps rendering to one core branch: events that are currently streaming,
and events whose streaming has already ended. If a client did not receive an
iteration from its first streamed event, it treats that iteration as historical
and renders it only after the staged detail response is complete.
Socket transport may still send ephemeral progress events that are not durable,
but any durable row kind listed below must have a deterministic restore event
mapping.

Current payload kinds:

| `kind` | Used for |
| --- | --- |
| `user_message` | User request text and optional attachment references, `{ kind, text, attachments? }`. |
| `tool_generated_user_message` | Tool-generated user-role model input with optional attachment references, `{ kind, text, attachments?, sources? }`. |
| `assistant_message` | Final assistant response text, `{ kind, text }`. |
| `assistant_delta` | Streamed assistant content snapshot, `{ kind, iteration, delta, content }`. |
| `skill_context` | Preloaded `$skill` selected-skill instructions and, when needed, the normal `loadSkill` `<skill>...</skill>` output exposed to the model as user-role context, `{ kind, name, path, text }`. |
| `tool_call` | Model tool-call request, `{ kind, iteration, toolCalls }`. |
| `tool_result` | Tool execution result, `{ kind, iteration, toolCallId, success, output }`. |
| `cot_work_reminder` | Model-visible reminder to continue an active `cot_work` plan, `{ kind, iteration, sourceDataId, text }`. |
| `interrupt` | User interruption request, `{ kind, requestedAt }`. |
| `error` | Turn-loop failure visible as assistant output, `{ kind, message }`. |

Restore event mapping:

| Row | `session.event` |
| --- | --- |
| `type=user` | `turn.input.recorded` |
| `kind=assistant_message` or `kind=error` | `turn.assistant.recorded` |
| `kind=assistant_delta` | `turn.assistant.delta` |
| `kind=assistant_reasoning` | `turn.assistant.reasoning` |
| `kind=tool_call` | `turn.tool.batch` |
| `kind=tool_result` | `turn.tool.result` |
| `type=interrupt` | `turn.interrupted` |

`sessiontoken` stores runtime connection tokens issued after a socket client
enters a session. A token is a routing and authorization grant for one physical
socket session; it is not durable session truth. Browser clients discard tokens
when the site is opened again and must attach to sessions again.

| Column | Contract |
| --- | --- |
| `token` | UUID primary key. Runtime-generated ids are UUIDv7-shaped. |
| `createdat` | Token issue timestamp. |
| `sessionid` | Session this token grants access to; cascades on session delete. |

The server prunes `sessiontoken` rows older than five days whenever a new token
is issued. Expired or missing tokens cannot be used for session input or
interrupt operations.

Project identity is not an authoritative file-backed id value. The session
server derives and verifies project identity from the workspace direct child
folder name; repository-local `/.ndx/.projectid` files are not part of the
identity contract.

Before project identity resolution, project paths are mapped into the fixed container workspace.
`NDX_HOST_ROOT` is the host runtime-root setting and maps to `/ndx`.
Workspace paths live under `/ndx/workspace`; global NDX home data lives under
`/ndx/.ndx`; logs live under `/ndx/.ndx/log`; PostgreSQL data lives under
`/ndx/pgvector`.
See `runtime-volume.md` for the complete volume contract and migration state.

`webclientstate` stores the browser client's own reconnect and presentation
state. It is not authoritative session truth and must not contain agent-loop,
tool-call, inference, or context-reconstruction state.

| Column | Contract |
| --- | --- |
| `clientid` | UUID primary key used by the web client when opening `/session`. |
| `userid` | Optional selected account reference; set null if the account is deleted. |
| `state` | JSONB browser state document, currently locale, local projects, active project, selected account, and last successful socket negotiation. |
| `updatedat` | Updated whenever the browser state document is written. |

The web client state SQL is maintained in
`packages/ndx/src/webclient/client-state/schema.ts` because it describes the
web client's own domain state, while `initServer` still owns schema
initialization.

`web_project` stores web-client preferences for projects discovered from
workspace folders. It is not the source of project truth; the folder under
`/ndx/workspace` is.

| Column | Contract |
| --- | --- |
| `projectname` | Workspace direct child folder name; primary key. |
| `screenorder` | Project menu order. Larger values appear first. Project add/reactivation assigns current maximum `screenorder + 1`; future manual reordering changes this value. |
| `userid` | Current account id used by the web client for this project. Defaults to `ndev` under the repository account contract. |
| `updatedat` | Updated when project menu metadata changes. |

Creating a web project creates a new workspace child folder and upserts a
`web_project` preference row. Deleting a web project accepts the request
asynchronously, removes the preference row, deletes sessions for that
`projectname`, and removes the physical folder in the background.

Model-provider connection settings and picker model entries are not stored in
PostgreSQL. The single durable source is `/ndx/.ndx/settings.json`, mounted from
`volume/.ndx/settings.json` in local development. The web provider/model API
reads and edits that file directly. Do not recreate legacy provider/model
tables; stale copies would split the source of truth
between hidden database state and the user-editable settings file.

## 기본 접속 정보

| 항목 | 값 |
| --- | --- |
| 서비스명 | `agent` |
| 베이스 이미지 | `ghcr.io/hikamaeng/ndx2-pgvector:<version>` |
| 컨테이너 | `agent` |
| 사용자 | `ndev` |
| 비밀번호 | `ndev` |
| 기본 DB | `ndev` (PostgreSQL 기본값) |
| 데이터 볼륨 | `./volume/pgvector` |
| 외부 포트 | 미오픈(호스트 매핑 없음) |

### 애플리케이션 DSN 예시

- 내부 서비스 접속:  
  `postgresql://ndev:ndev@127.0.0.1:5432/ndev`
- 호스트 직접 접속은 기본 포트가 노출되지 않으므로 `docker exec` 경유:
  `docker exec -it agent psql -U ndev -d ndev`

### 운영 규칙

* `POSTGRES_USER`/`POSTGRES_PASSWORD` 기본값은 agent 이미지에 내장한다.
* DB는 PostgreSQL 권한 모델을 기준으로만 접근해야 하며, 세션 서버는 연결 설정을 단일 신뢰 소스로 공유해야 한다.
* `./volume/pgvector`는 ndx 루트 볼륨 하위의 상태 디렉터리이므로 로컬 Git에서 제외(`.gitignore`)한다.
