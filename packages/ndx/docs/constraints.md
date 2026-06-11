# Constraints

* This is the shared product package for `apps/ndx`.
* Keep common, agent, and webclient contracts inside this package until the repository documents a different package split.
* Do not import from `apps/`.
* Keep domain invariants here instead of in app lifecycle wiring.
* Keep non-domain shared packages cohesive and standalone.
* `apps/ndx` may depend on `ndx/common`, `ndx/agent`, and `ndx/webclient/*`.
