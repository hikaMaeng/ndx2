---
name: headless-browser-test
description: Run headless browser smoke and E2E tests for scaffolded web services. Use when verifying rendered web UI, checking browser errors, creating Playwright-style scenarios, collecting screenshots, or testing a deployed/local service through Chromium.
---

# Headless Browser Test

Use scripts first. Keep prompts short; let the checked scripts enforce browser setup, URL handling, artifacts, trace capture, and report shape.

## Default Flow

1. Resolve the target URL from the user, deploy report, service docs, or local dev server output.
2. Run the environment check in the same environment that will execute the browser test before installing or changing dependencies:

```sh
sh .codex/skills/headless-browser-test/scripts/check-headless-browser-env.sh
```

3. Run a smoke test:

```sh
node .codex/skills/headless-browser-test/scripts/run-headless-browser-test.mjs --url <url>
```

4. For real E2E, write a small JSON scenario and run it with `--spec`.
5. If the user asks for durable repository tests, generate a Playwright template and fill only the marked TODOs:

```sh
sh .codex/skills/headless-browser-test/scripts/write-playwright-e2e-template.sh test/e2e
```

## Load Only What You Need

* `references/environment.md`: package/runtime checks, missing Chromium or Playwright handling, local vs container URL rules.
* `references/scenario-authoring.md`: scenario JSON format, stable locator contract, and fill-in templates for common tests.
* `references/operation.md`: deployed service testing, artifact paths, failure triage, and final-answer requirements.

## Hard Rules

* Do not run `playwright install`, change package dependencies, or edit `yarn.lock` until `check-headless-browser-env.sh` proves the runtime is missing.
* A host-side check failure does not prove the ndx Docker image is missing packages. Confirm the execution context before reporting missing runtime.
* Test rendered behavior that a user can see or operate. Do not assert implementation details.
* Prefer role/name, label, text, alt text, title, and test id locators. Use CSS/XPath only when no stable user-facing or documented test hook exists.
* Keep tests isolated. Do not rely on execution order, shared browser storage, or state left by a previous test.
* Avoid uncontrolled third-party pages and services. Mock or constrain them when they affect the result.
* Prefer auto-waiting locator actions and web-first assertions over manual sleeps or one-shot visibility checks.
* Capture evidence under `test/YYYYMMDD/<HHMMSS>_headless-browser-test/`.
* Final answers must include pass/fail, tested URL, report path, screenshots, and whether the run was smoke-only or scenario-based.
