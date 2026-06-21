# Constraints

## Blast radius

Bound a change with this table before editing — it is the consumer edge set.

| Subpath | Consumers | Invariants (do not break) |
| --- | --- | --- |
| `ndx/common` | every package surface, `apps/ndx` | Stays runtime-neutral; no node/browser globals. |
| `ndx/agent` (`Session`) | `apps/ndx` server, `ndx/agent/turnloop` | Session id stable for a connection's lifetime; turn order is append-only. |
| `ndx/webclient/server` | `apps/ndx` server routes | `.ndx/settings.json` shape is backward-compatible; unknown keys ignored, not dropped. |

Packages must never import from `apps/`.

## Boundary

App modules own Express, Vite, process lifecycle, socket attachment, and UI
composition. This package owns framework-independent product rules only.
