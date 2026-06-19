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
Final provider-visible message assembly is owned by
`packages/ndx/src/agent/turnloop/model-call/finalMessages`. Its public entry is
`index.ts` function `prepareFinalModelRequestMessagesForCall`. That function
owns the non-exported ordered final-message policy list and runs it over durable
rows. It also owns the non-exported row-projection policy order. `messages/`
and `rows/` own only the individual policy implementations, while row handling
still routes each row through an ordered projection-policy array instead of a
single switch-like projector. The result is then combined with one-request
attachment payloads.
The pipeline may suppress stale runtime-control noise that would otherwise be
replayed into a later user request, including old `cot_work_reminder` rows,
runtime-control error rows, and invalid tool-call/tool-output pairs from before
the latest real user row. Suppression affects only model visibility; rows remain
durable audit history. The `turn.model.request` prefix-drift audit receives the
post-policy provider-visible message list, so any defensive suppression that
changes the stable prefix is still reported.

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

Compact text is a recall index, not an authoritative replacement for the
original rows. It must preserve `dataid` anchors such as `[dataid:42]` or
`[dataid:42-47]` and should signal when exact omitted detail needs
`session_history` with `mode: "recall"`. The backing `sessiondata` rows remain
the source of truth for tool calls, tool results, errors, attachment references,
and full JSON payloads.

There is no manual history window control. Context reconstruction after a
compact always includes the latest compact row and every later sessiondata row
in append order. This keeps model request prefixes stable for provider KV-cache
reuse; trimming decisions belong to durable compaction, not client-side session
settings.

Session history can also be compacted as the first row of a branched session.
`session.branch.create` is a session socket command that summarizes source
history through a selected user turn with the same compact package used by
automatic context compaction, then inserts that summary as the new session's
initial `compact` row. The branch session row and socket grant are created
before this summary completes so clients can move to the branch immediately and
show `compactRunning` progress from `turn.compact.started` /
`turn.compact.completed`. The branch compact row is model-visible history and
is also shown as the first restored message in clients after completion.
If model compaction fails, the branch session remains durable and idle, no
fallback transcript is recorded as a successful branch compact, and the session
receives an assistant `error` row plus `turn.failed` so clients can tell the
user that previous-history compaction failed.

`session.turn.delete` is a session socket command that deletes one full turn:
the selected `user` row and every following `sessiondata` row before the next
`user` row. `sessionsearch` rows are removed by foreign-key cascade. After turn
deletion, context usage aggregates are rebuilt so later automatic compaction
decisions do not use stale average-turn data.

Compaction can happen before the current user input is recorded. In that case
only previous history is compacted, then the user input is appended normally so
the turn semantics are preserved.

If an iteration reaches the limit after the current input has already produced
tool results or hook output, compaction must not blur that just-finished turn.
The compact source window ends before the current input row. The turn loop then
appends a `compact_replay` row after the compact row with the current input
turn's model-visible rows. Browser history ignores `compact_replay`, but model
context reconstruction expands it in place using the normal user/tool/result
row projections. The turn loop records a final assistant message explaining
that the turn ended because history was compacted, and session-server request
handling may start a fresh continuation turn after that terminal turn.

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

Context-window usage is estimated from the model request shape that will be
sent to the Responses-compatible provider, including role labels, tool-call
continuation records, and tool definitions. When the running agent process has
a previous model-request stable-prefix preview for the same session, usage
calculation reuses that preview for the matching prefix and estimates only the
new suffix. The preview is a non-authoritative in-memory optimization for
accounting and prefix-drift auditing; PostgreSQL `sessiondata` remains the
source of truth for context reconstruction, and stale previews are ignored when
they do not match the reconstructed prefix.

Automatic compaction reserves output budget and an expected next-turn budget.
Observed average turn size may reduce that expected budget when turns are
small, but it is capped by the default context-size percentage so a past
exceptionally large tool-heavy turn cannot force early compaction for unrelated
later turns.

`sessionsearch` stores the searchable text projection of selected
`sessiondata` rows. It is used by `session_history` `mode: "search"` when the
agent does not know the relevant `dataid`:

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

The turn loop invokes built-in session-search hooks from `turn.end` after the
durable input and final assistant `sessiondata` rows are written. The hooks
insert only two model-visible row kinds:

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

`session_history` `mode: "recall"` bypasses `sessionsearch` and reads
`sessiondata` by exact `dataid` or ordered `startDataId` / `endDataId` range.
Use recall for compact-summary anchors and search only when the anchor is not
known.

## Runtime Selfcheck

`selfcheck` is an LLM-assisted background analysis surface for runtime
improvement candidates. It reads `sessiondata` and hook audit rows, extracts
bounded candidates, sends those candidates to the configured selfcheck model,
and stores manual improvement proposals outside session history.

Selfcheck never rewrites `sessiondata`, never inserts model-visible rows into a
running session, and never participates in turn context reconstruction. The
mechanical phase is only a prefilter for suspicious tool or hook outcomes such
as failed tools, empty or zero-result outputs, hook stops, hook interruptions,
hook result rewrites, and hook failures. The LLM phase decides whether the
candidate is actionable and records the recommendation for human review.

Tool candidates are intentionally broader than hard failures. A successful tool
result is still a candidate when structured output reports empty collections
such as `results`, `matches`, `items`, `files`, `rows`, `documents`, or `hits`,
or zero counters such as `count`, `total`, `resultCount`, `matchCount`,
`returned`, or `returned_line_count`. JSON strings are parsed before these
checks so search tools that serialize `{ "results": [] }` are still caught.
Search/list tools may also use natural-language no-match text such as
`no results`, but file content from structured `read_file` output is not scanned
with those broad text rules to avoid treating application strings like
`not found` as search failures. The LLM analysis must then classify whether the
root cause is a bad model query, an unfriendly tool schema or description, a
tool bug, normal absence of data, or analyzer noise.

Selfcheck tables:

| Table | Contract |
| --- | --- |
| `selfcheck` | LLM-produced manual improvement candidates for tools, hooks, prompt/context guidance, settings, docs, or implementation. Rows are deduplicated by subject and fingerprint and keep occurrence counts. |
| `selfcheck_analysis_candidate` | Mechanical prefilter output waiting for LLM analysis. Candidate state is separate from sessiondata cursor state so LLM failures do not require rescanning history. |
| `selfcheck_analysis_cursor` | Per-analyzer progress marker. The default analyzers are subject-wide cursors such as `tool:*` and `hook:*`. |
| `selfcheck_analysis_run` | Scheduler/manual run audit with scanned, candidate, LLM, and selfcheck counts. |
| `selfcheck_hookrun` | Audit rows for meaningful existing hook runs, including stops, model-response interruptions, request/tool/result replacement, final assistant text, and hook failures. This table does not define a new hook event. |

The selfcheck model is configured in `.ndx/settings.json` under
`selfcheck.model` and resolves through the existing `models` and `providers`
settings. Batch size, interval, evidence size, and per-run LLM analysis limits
also live under `selfcheck`.

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

`[[rewriter]]` is a request marker handled by the system
`turn.request.received` hook before the user row is appended. The hook removes
the marker, searches `sessionsearch` directly with the raw user request, runs
the configured rewrite model, and replaces `requestText` with the rewritten
prompt plus a deterministic `세션 검색 보강 컨텍스트` section built from the
top project search results.

When the marker is present, the durable user `sessiondata` row stores the
rewritten prompt, not the raw marker-bearing request. No `prompt_rewrite`
tool-call or tool-result rows are created. The hook may use read/search/web/bash
tools inside the internal rewrite loop for current workspace facts, but
session-history enrichment is not delegated to the model as a tool decision.
The rewriter must not reintroduce internal client markers such as
`[[NDX_SKILL_*]]`, `[[NDX_THINKING_*]]`, or `[[rewriter]]` through the rewritten
prompt or appended session-search context. Explicit selected skills are already
preloaded by the earlier request-received skill marker hook; if the rewrite
model omits the visible `$skill` command, the rewriter preserves that display
command in the durable user row without restoring the internal marker syntax.

`session_history` is a function tool over `sessionsearch`. It supports three
scopes: all NDX sessions, all sessions in one project, and one session. Omitted
scope defaults to the current project because prior coding work usually spans
multiple sessions in one repository. SQL narrows the scope first, then ranking
is applied. With embedding settings, the tool embeds the query and prioritizes
cosine similarity while still exposing Korean FTS rank and lexical substring
matches. Without embedding settings or when query embedding fails, it uses
`ts_rank_cd` over `fts` plus the same lexical substring fallback so code
identifier prefixes such as `NextPiecePre` can match stored text containing
`NextPiecePreview`. With no query, it lists recent rows in scope.
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
session attach. After `session.attached`, it requests `session.history.summary`
over the session socket with the attached `sessionid`. The response contains
only the visible user request and final assistant/error event for each turn
plus collapsed turn shells. When a user expands a turn, the client requests
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

`reasoning_control` rows use `tool_generated_user_message` contents with
`sources=[{ tool: "thinking_level" }]`. They are model-visible user-role
control tags such as `<ndx_thinking_level>forbidden</ndx_thinking_level>`,
appended immediately before the current user request, but they do not restore as
chat messages. The stable developer prompt instructs models to apply only the
nearest such tag before the latest user request. The same effort is also sent
through the provider request body when supported.

The server does not persist runtime session grants. A physical WebSocket keeps
an in-memory set of attached `sessionid` values. A freshly opened browser has
no grants until it creates or attaches the session again, while PostgreSQL
remains the only authoritative session state.

Legacy installations may still have an old runtime-grant table; session schema
migration drops it because socket grants are no longer durable data.

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
