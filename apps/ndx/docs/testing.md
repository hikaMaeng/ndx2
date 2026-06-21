# Testing

Smoke verification should cover `/health`, `/api/health`, and the deployed front
shell's `main`, heading, status, and button semantics.

Prefer landmarks and accessible names; use the approved test ids in
[constraints.md](constraints.md#frontend-locator-contract) for
structure-independent hooks. Renaming a test id requires updating the browser
tests that depend on it.
