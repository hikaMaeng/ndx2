# Testing

Scaffold verification uses `agenttest` JSON reports under `test/YYYYMMDD/` plus smoke checks against the deployed server.

Frontend browser tests should use documented landmarks, accessible names, and
stable test ids from `docs/constraints.md` or the owning app package docs.

Use the repository-local `headless-browser-test` skill for Chromium/Playwright
checks against Docker-deployed services. The ndx2 agent image owns the browser
runtime; project test work should focus on the URL, user-visible scenario,
report, and screenshots rather than dependency installation.
