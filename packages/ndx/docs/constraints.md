# Constraints

## Blast radius

Bound a change with this table before editing an exported subpath — it is the
consumer edge set. Symbols per subpath are in [api.md](api.md); partitions in
[architecture.md](architecture.md).

| Subpath | Consumers | Invariants (do not break) |
| --- | --- | --- |
| `ndx/common/protocol` | agent server, `ndx/webclient/*`, `apps/ndx` (both ends of every socket/HTTP frame) | DTO shape is backward-compatible; both ends import the same contract; no surface-specific fields leak in. |
| `ndx/common/server-path` | `apps/ndx` server process, agent runtime | Container path constants are fixed by the volume contract; change them only with `docs/runtime-volume.md`. |
| `ndx/agent` (`initServer`) | `apps/ndx` `src/server/index.ts` | Agent owns turn execution; webclient never runs a turn. |
| `ndx/agent/session` | `ndx/agent/turnloop`, `apps/ndx` history routes | `sessiondata` is append-only; ordered replay must stay stable; session id stable per connection. |
| `ndx/agent/turnloop` | `ndx/agent/chat`, `apps/ndx` socket server | Durable turn events persist before client delivery; interrupts do not drop persisted state; post-response request effects launch from a later macrotask and are not awaited by the completed turn. |
| `ndx/agent/requestQue` | `ndx/agent/turnloop`, `ndx/agent/hook`, `ndx/agent/tool`, `apps/ndx` socket server | Edit and consumer bridges stay separate; every item has a required assigned model snapshot; socket projection hides paths but includes attachment ids for editing; claimed items are hidden and claim output strips queue-local attachment ids before sessiondata persistence. |
| `ndx/webclient/server` | `apps/ndx` web routes | Settings reads tolerate a missing file and ignore unknown keys (forward-compat). |
| `ndx/webclient/front` | `apps/ndx` `src/webclient_front` React shell | Front helpers are presentation-only; screen is a pure projection of model-render stores (see [internals.md](internals.md#decisions)). |

## Ownership

* This is the shared product package for `apps/ndx`. Keep common, agent, and
  webclient contracts here until the repository documents a different split.
* Do not import from `apps/`.
* Keep domain invariants here, not in app lifecycle wiring.
* `apps/ndx` may depend on `ndx/common`, focused `ndx/agent/*` subpaths, and
  `ndx/webclient/*`.
