# Internals

The root workspace owns dependency policy, task orchestration, and Docker Compose integration.

Runtime files owned by application containers live under the single `/ndx`
volume. Detailed path ownership is maintained in `runtime-volume.md`.

Deployable services are split by operational surface:

| Service | Package dependencies | Notes |
| --- | --- | --- |
| `apps/ndx` | `ndx/common`, `ndx/admin/*` | Administration HTTP and front shell. |
| `apps/ndx` | `ndx/common`, `ndx/agent/*` | Agent service, session web client, and session socket-server wiring. |

The agent runtime is modeled around task turns.

A task turn starts from a user request, reconstructs the model context from PostgreSQL, runs the agent loop, records every meaningful event, and ends when the agent has finished the requested work or has been interrupted.

Durable event categories include:

* user requests;
* model intermediate responses;
* model tool-call requests;
* tool execution results;
* interruption commands and tool interruption results;
* final model responses;
* task-turn resume markers.

Context reconstruction is an invariant function over durable session data. The server may hold an assembled context only for the lifetime of one model request. After each model request, that in-memory context is discarded and rebuilt again from stored records.

Crash recovery depends on this rule: after a process exit, the server can inspect PostgreSQL records, determine the last durable task-turn state, and resume or close the turn according to explicit recovery policy.

Concurrency depends on the same rule: when multiple clients interact with the same session, they converge through durable event writes instead of competing over a separate live-session object.
