# Runtime Control

The agent runtime distinguishes idle, active, interrupted, queued, and interjected work.

Session-server user-visible fallback text is resource keyed. The session server
uses English when no request language is supplied. Browser clients send their
current web-client locale as an optional `language` field on session socket
requests, and app/server resource lookup overlays `/ndx/assets/i18n/*.json`
before bundled `apps/agent/assets/i18n/*.json`.

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

## Iteration Limit

Model/tool iteration finalization is configured by `/ndx/.ndx/settings.json`
under `runtime.maxModelIterations`. The default is `500`. When a turn exceeds
that value, the agent makes one final model request with no tools and asks for a
user-facing summary instead of treating the iteration count itself as a runtime
failure.

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

## Turn Hooks

The session server exposes only these turn-loop hook events:

* `turn.request.received`: runs immediately after a user request is accepted and before the user row is appended. It may rewrite `requestText`, create side-effect sessiondata rows, or stop the turn with `finalAssistantText`.
* `turn.context.prepared`: runs after messages, tools, and sessiondata-derived context are ready and immediately before a model request. It may replace or append model messages, replace model tools, or stop the turn with `finalAssistantText`.
* `turn.tool.called`: runs after the model asks for tools and before tool execution. It may replace `toolCalls` or stop the turn with `finalAssistantText`.
* `turn.tool.results.collected`: runs after all requested tools finish and before tool results are recorded and sent back to the model. It may replace `toolResults` or stop the turn with `finalAssistantText`.
* `turn.response.prepared`: runs after the iteration ends and before the final assistant row is appended. It may replace the final assistant text, stop the turn with `finalAssistantText`, or return `nextRequestText` to end the current turn without writing that final assistant row and start a new turn from the generated request on the next Node tick.

Hook events are not added for turn-loop internals such as failure logging,
context-usage accounting, model-response receipt, resume preparation, or
post-write completion.

`runAgentTurn` and `runSessionTurn` are side-effect procedures. After entry,
they write sessiondata, update session state, and emit socket-facing events;
callers do not receive a turn result object.
