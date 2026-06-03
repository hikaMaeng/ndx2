# Constraints

* This is the shared product package for `apps/ndx` and `apps/ndx`.
* Keep common, admin, and agent contracts inside this package until the repository documents a different package split.
* Do not import from `apps/`.
* Keep domain invariants here instead of in app lifecycle wiring.
* Keep non-domain shared packages cohesive and standalone.
* `apps/ndx` may depend on `ndx/common` and `ndx/admin/*`.
* `apps/ndx` may depend on `ndx/common` and `ndx/agent/*`.
