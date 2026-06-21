# Internals

## Decisions

* Agent owns turn execution; webclient is a pure projection. Why: one source of
  truth for turn ordering avoids split-brain between socket delivery and
  persisted history.
* `sessiondata` is append-only and compaction selects the model-window rows
  (`src/agent/compact`). Why: durable replay plus bounded model context from the
  same store.
* All host/container paths resolve through `src/common/server-path`. Why: one
  place to change the runtime volume layout; callers never encode it.
* Webclient settings reader ignores unknown keys instead of failing
  (`src/webclient/server/settings/model-patch`). Why: forward-compat so an older
  package never bricks a newer `.ndx/settings.json`.
* Webclient front renders from model-render stores: screen = pure projection of
  the model, `state` version is the render trigger. Why: decouples React
  composition from domain state (see the `react-model-render` skill).

Add internals only when an implementation detail affects future maintenance.
Agent server process-tool contracts are in [tool-process.md](tool-process.md).
