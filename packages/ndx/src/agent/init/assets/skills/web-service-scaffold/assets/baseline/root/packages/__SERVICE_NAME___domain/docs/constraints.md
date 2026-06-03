# Constraints

* This is the only domain package for `apps/__SERVICE_NAME__`.
* Do not create another domain-related package for the same app.
* Do not import from `apps/`.
* Keep domain invariants here instead of in app lifecycle wiring.
* Keep non-domain shared packages cohesive and standalone.
