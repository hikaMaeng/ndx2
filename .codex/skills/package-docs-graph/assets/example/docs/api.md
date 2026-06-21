# API

Exports grouped by subpath. Each entry links to the defining symbol so a model
jumps straight to the edit target.

## `ndx/common`

* `resolveNdxPath(root, ...segments)` — `src/common/path.ts#resolveNdxPath`.
  Single resolver for `.ndx` layout; never join `.ndx` paths by hand.
* `newId()` — `src/common/id.ts#newId`. UUID v7, time-ordered.

## `ndx/agent`

* `Session` — `src/agent/session.ts#Session`. Owns turn ordering for one
  connection. See decision in [internals.md](internals.md#decisions).
* `runTurnLoop(session)` — `src/agent/turnloop.ts#runTurnLoop`.

## `ndx/webclient/server`

* `loadModelSettings(root)` — `src/webclient/server/settings.ts#loadModelSettings`.
  Reads `.ndx/settings.json`; tolerates a missing file, throws on malformed.
