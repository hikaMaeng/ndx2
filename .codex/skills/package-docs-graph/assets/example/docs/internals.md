# Internals

## Decisions

* Session state lives in `src/agent`, not webclient — webclient is a pure
  projection. Why: one source of truth for turn ordering avoids split-brain
  between socket and persisted history.
* All `.ndx` paths resolve through `resolveNdxPath`. Why: one place to change
  the on-disk layout; callers never encode the layout.
* Settings reader ignores unknown keys instead of failing. Why: forward-compat
  so an older package never bricks a newer `.ndx/settings.json`.

Add internals only when an implementation detail affects future maintenance.
