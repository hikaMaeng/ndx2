# Constraints

* This is the shared product package for `apps/admin` and `apps/agent`.
* Keep common, admin, and agent contracts inside this package until the repository documents a different package split.
* Do not import from `apps/`.
* Keep domain invariants here instead of in app lifecycle wiring.
* Keep non-domain shared packages cohesive and standalone.
* `apps/admin` may depend on `ndx/common` and `ndx/admin/*`.
* `apps/agent` may depend on `ndx/common` and `ndx/agent/*`.
