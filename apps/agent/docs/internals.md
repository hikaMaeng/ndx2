# Internals

The app intentionally contains no agent-loop implementation yet. Agent domain contracts live in `packages/ndx/src/agent`; socket/session process wiring belongs under `src/server/agent` and attaches to the same Express server as the web backend.
