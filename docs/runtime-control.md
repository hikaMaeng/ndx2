# Runtime Control

The agent runtime distinguishes idle, active, interrupted, queued, and interjected work.

Session-server user-visible fallback text is resource keyed. The session server
uses English when no request language is supplied. Browser clients send their
current web-client locale as an optional `language` field on session socket
requests, and app/server resource lookup overlays `/ndx/.ndx/i18n/*.json`
before bundled `apps/ndx/assets/i18n/*.json`.

## Idle

An idle session has no active agent loop. A new user request is accepted immediately and starts a new task turn.

## Interrupt

An interrupt stops an active task turn. It is not enough to exit the agent loop.

The server must also send interruption commands to every active execution unit:

* local tools;
* remote MCP tools or servers where supported;
* subagents;
* pending model or inference work where supported.

The interruption command and every observed interruption result must be written to context history.

Tools or remote servers that cannot honor interruption still need explicit policy. The session history must make clear whether the tool stopped, ignored cancellation, timed out, or completed after interruption was requested.

Function tools that are waiting on connected clients, including
`askUserQuestion`, receive the active turn abort signal through the session
client bridge. When the signal aborts, the pending socket request is removed and
all attached clients receive `session.client.request.closed` with
`reason="interrupted"`. The tool returns a cancelled result instead of waiting
for a stale browser response.

## Iteration Limit

Model/tool iteration finalization is configured by `/ndx/.ndx/settings.json`
under `runtime.maxModelIterations`. The default is `500`. When a turn exceeds
that value, the agent makes one final model request with no tools and asks for a
user-facing summary instead of treating the iteration count itself as a runtime
failure.

Model requests are not stopped merely because the first response token is slow.
Local models may spend more than two minutes in prompt processing before
streaming output. While a model request is still pending, the turn loop emits a
socket-only `turn.model.progress` event every 120 seconds telling connected
clients that the request is still running and that the user may interrupt the
session if they do not want to keep waiting. These progress notices are not
written to `sessiondata` and are not model-visible history.

OpenAI-compatible model provider requests use an explicit 60-minute
communication timeout for request headers and streaming bodies. This overrides
the shorter default Node fetch/undici timeout so slow local models can finish
prompt processing before their first streamed event. User interrupts still abort
the active provider request immediately.

The system `turn.model.responding` StreamGuard hook interrupts a model response
when reasoning summary text exceeds the configured limit before any output text
is produced. Configure the limit in `/ndx/.ndx/settings.json` under
`hooks.StreamGuard.MAX_REASONING_LENGTH`. If the hook setting is absent or
invalid, the fallback remains `240000` characters.

The same StreamGuard hook also interrupts a model response when the reasoning
summary repeats the same paragraph before any output text is produced. This
duplicate-paragraph guard is fixed runtime policy and does not depend on a
settings parameter. It uses the reasoning summary observed so far, splits it on
blank-line paragraph boundaries, normalizes whitespace, and stops the active
model response as soon as a duplicate non-empty paragraph is found. The turn
then follows the same existing interruption path as other StreamGuard stops.

The same fixed StreamGuard policy also watches for meta execution reasoning,
exact repeated tail blocks, dense repeated word-shingles in the latest reasoning
window, and excessive no-output reasoning streams. Meta execution reasoning is
reasoning that gets stuck analyzing the transcript, failed tool-call
serialization, JSON/control-character errors, or whether prior function output
was shown as user text instead of progressing the task. These checks are
intentionally independent of `MAX_REASONING_LENGTH`: they stop local-model
reasoning loops before the larger hard length fallback is reached, while
clearing their state as soon as assistant output text or a tool call starts.

Loop detection during tool-heavy turns is configured under
`runtime.loopDetectionInterval`. The default is `50`. After tool results are
collected on iterations divisible by that interval, the system
`turn.tool.results.collected` hook sends the current turn's sessiondata and
latest tool results to the current session model with no tools and asks whether
the turn is trapped in a repetitive loop. If the model says to stop, the hook
ends the turn with a user-facing assistant message. Values less than or equal
to `0`, including `0` and `-1`, disable this loop detection request.

## Queued Work

If a user sends another request while the agent loop is active, the request may be queued. Queued work starts after the current task turn ends.

Queued requests are durable events, not process-local memory only.

## Interjection

An interjection is a mid-turn user message inserted into the active task turn.

If a tool is currently running, the server lets the active tool handling point finish according to tool policy. Then it records the interjection and resumes the agent loop with context that includes the new message and an instruction to reconsider the next step.

Interjection must preserve event ordering so every connected client can render the same history.

## Tool-Owned Progress Policy

Tool-specific live progress rules belong to the base tool folder. For example,
`cot_work` owns plan validation, elapsed-time calculation, and the model-facing
active-plan reminder hook policy under
`packages/ndx/src/agent/tool/base/cot_work`. The turn loop may call that policy
when it records assistant sessiondata, emits `turn.cot_work`, or runs the
registered context-prepared hook, but it must not own the policy itself.

## Interactive Client Requests

The session server may issue `session.client.request` messages while a function
tool is running. A connected client answers with `session.client.response`.
Only clients attached to the target session on the current WebSocket may
answer.

Interactive client requests are not queued user turns and do not start a new
sessiondata `user` row. They resolve the current tool call. If several clients
are attached to the same session, the server broadcasts the request and accepts
the first valid response for the request id.

If no client is attached when an interactive request is created, or every
attached client disconnects before answering, the request remains pending in
the running turn and is resent when a client attaches to the same session. A
normal answer or cancel closes the pending request and broadcasts
`session.client.request.closed` so duplicate browser dialogs disappear.

## Turn Hooks

The session server exposes only these turn-loop hook events:

* `turn.request.received`: runs immediately after a user request is accepted and before the user row is appended. It may rewrite `requestText`, create side-effect sessiondata rows, or stop the turn with `finalAssistantText`.
* `turn.context.prepared`: runs after messages, tools, and sessiondata-derived context are ready and immediately before a model request. It may replace or append model messages, replace model tools, or stop the turn with `finalAssistantText`.
* `turn.model.request`: runs at the model-provider request boundary according
  to its documented meaning. If the hook is used to protect provider prefix
  cache, it must see the provider-visible request shape that will be sent, not
  an earlier pre-serialization approximation.
* `turn.model.responding`: runs while model output is streaming or otherwise
  being received. It may interrupt the active model response according to its
  documented policy.
* `turn.tool.called`: runs after the model asks for tools and before tool execution. It may replace `toolCalls` or stop the turn with `finalAssistantText`.
* `turn.tool.results.collected`: runs after all requested tools finish and before tool results are recorded and sent back to the model. It may replace `toolResults` or stop the turn with `finalAssistantText`.
* `turn.end`: runs after turn completion data is available and before the turn
  is treated as fully complete by runtime bookkeeping.

The system `turn.request.received` rewriter marker hook handles explicit
`[[rewriter]]` suffixes from the web client. It removes the marker before
persistence, searches `sessionsearch` directly with the raw user request,
invokes the configured rewrite model, appends a deterministic session-search
context section, and returns `replaceRequestText`. The stored user row is the
rewritten request, not the raw marker-bearing text.

Hook events are not added for turn-loop internals such as failure logging,
context-usage accounting, model-response receipt, resume preparation, or
post-write completion.

The hook surface is a user-approved product contract, not an implementation
convenience. Do not add a hook event, hook folder, built-in system hook array,
hook runner, `runXxxHook` helper, hook-like callback, or hidden hook execution
path unless the user directly instructs it or explicitly approves it. This ban
also applies when a feature appears easy to implement as a new interception
point.

If an existing hook name no longer matches where it runs, fix the placement or
rename/update the documented meaning after approval; do not add another hook.
For example, a hook named `turn.model.request` must run at the model-provider
request boundary if its documented purpose is "immediately before sending to
the model". A pre-serialization messages hook is a different meaning and must
not silently share that name.

Feature work should reuse existing hooks only when the documented hook meaning
already matches the interception point. Otherwise, implement the behavior in
the owning module:

* provider request serialization and compatibility: response API/provider
  adapter;
* context reconstruction and model-visible ordering:
  `packages/ndx/src/agent/turnloop/model-call/finalMessages`;
* tool-specific policy: the base tool folder;
* UI rendering of turn events: webclient front reducers;
* socket fan-out: app server socket wiring.

Runtime-control failures such as stream-guard reasoning loops, model-request
interrupt markers, and malformed tool-call argument failures remain durable
sessiondata rows for audit and UI history. Future model requests do not replay
those rows directly when the final-message policy pipeline classifies them as
stale runtime-control noise. The prefix-drift audit runs after that final
message pipeline, not before it.

Turn-loop code should not contain feature-specific hook substitutes. If a
change does not alter the essential turn lifecycle, the turn loop may pass
typed data to an existing boundary, but the policy must live outside the turn
loop.

`runAgentTurn` and `runSessionTurn` are side-effect procedures. After entry,
they write sessiondata, update session state, and emit socket-facing events;
callers do not receive a turn result object.

At turn start, `updateSessionStartTurn` returns durable session metadata. The
turn loop reconstructs context from the latest compact row and later append-only
sessiondata rows. Clients cannot change the model-visible history window for a
later turn; compaction is the only supported history-shortening mechanism.
