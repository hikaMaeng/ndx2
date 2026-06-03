# NDX Tool Process Specification

NDX tools are external processes. A tool may be written in shell, Node, Python, or any executable runtime, but its observable process contract is the same.

## Invocation

Each tool directory contains `tool.json`.

```json
{
  "tool": {
    "command": "bash",
    "args": ["./index.sh", "{path}"],
    "stdin": "{content}",
    "env": {}
  },
  "schema": {
    "type": "function",
    "name": "read_file",
    "parameters": {
      "type": "object",
      "properties": {
        "path": { "type": "string" }
      },
      "required": ["path"]
    }
  }
}
```

`args` and `stdin` templates may reference names declared under
`schema.parameters.properties` with `{name}` syntax.

They may also use predefined agent runtime templates with `$NAME` syntax. These
templates are not model-provided arguments; the tool collector resolves them at
call time and passes their serialized value to the process as a normal argv or
stdin string. Unknown `$NAME` templates are rejected while loading the tool.
Runtime templates are resolved independently and lazily: unused templates must
not read context, scan skills, or perform other agent-runtime work.
Runtime template values come from the current tool execution turn context that
the agent loop passes to the collector; process tools must not reconstruct that
state by reading session storage or scanning agent internals.

Current runtime templates:

- `$SKILL_LIST`: JSON array of the skills visible to the current turn. Each item
  has `name`, `description`, and physical `path`.
- `$LOADED_SKILL`: JSON object describing skills already present in the current
  reconstructed context: `{ "names": string[], "paths": string[] }`.

Built-in tools that need agent runtime state should consume these runtime
templates instead of reading session storage, connecting to PostgreSQL, or
reimplementing context reconstruction.

## Built-In Runtime Placement

Built-in process-backed tools live in
`packages/ndx/src/agent/tool/base/<tool>`. The bundled server resolves the
built-in tool root as `<server bundle directory>/base`, so the Docker runtime
must copy that tree to `/app/dist/server/base`.

Do not copy it to `/app/dist/server/basetools`. Function tools such as
`session_history` are bundled into server JavaScript and can still appear when
the process-tool directory is missing. That partial tool list is a broken
runtime: `bash`, `read_file`, `grep_search`, `edit`, and `loadSkill` disappear,
which can make the model overuse `session_history` because the normal current
workspace tools were never exposed.

`apps/ndx/src/server/docker.test.ts` guards this Dockerfile path contract.

The process receives:

- `NDX_TOOL_NAME`
- `NDX_TOOL_CALL_ID`
- `NDX_TOOL_ARGUMENTS`
- `NDX_TOOL_DIRECTORY`
- `NDX_USER_HOME`, the container-side NDX virtual root, normally `/ndx`
- `NDX_PROJECT_HOME`, the selected project root under `/ndx/workspace`

Built-in filesystem tools resolve relative paths from `NDX_PROJECT_HOME`, but
container absolute paths are valid when they stay under `NDX_USER_HOME`. They
must reject paths outside that virtual root. Tools run inside the application
container and must not expect Windows host paths to exist as physical paths.

## Stdout Event Protocol

Tools should emit newline-delimited JSON events on stdout.

Progress:

```json
{"type":"progress","message":"reading file"}
```

Debug:

```json
{"type":"debug","message":"candidate skipped","data":{"path":"node_modules"}}
```

Successful final result:

```json
{"type":"result","success":true,"output":{"path":"src/a.ts"}}
```

Failed final result:

```json
{"type":"error","success":false,"message":"file does not exist"}
```

Rules:

- `progress` and `debug` may appear many times.
- `result` or `error` is the final event.
- At most one final event should be emitted.
- stderr is diagnostic output, not protocol output.
- Non-JSON stdout is treated as legacy output only when no protocol events were emitted.

## Cancellation

The collector runs each tool in a process group. Cancellation and timeout send `SIGTERM` to the process group first, then `SIGKILL` after the grace period.

Shell tools must trap `TERM` and `INT` where cleanup is needed:

```sh
trap cancelled TERM INT
```

The built-in shell helper emits a failed final event and exits `130` on cancellation.

## Collector Result

The collector turns process behavior into `NDXToolExecutionResult`:

- `success`
- `failed`
- `cancelled`
- `timeout`
- `spawn_error`
- `protocol_error`

Model-facing output is `result.output`. Structured details remain available in `events`, `stdoutText`, `stderrText`, `exitCode`, `signal`, and timing fields.
