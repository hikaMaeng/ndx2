---
name: headless-browser-test
description: Run headless browser smoke and E2E tests for scaffolded web services. Use when verifying rendered web UI, checking browser errors, creating Playwright-style scenarios, collecting screenshots, or testing a deployed/local service through Chromium.
---

# Headless Browser Test

Use scripts first. This skill is for the NDX agent running inside its Docker runtime to test a project created or managed by NDX. Keep prompts short; let the checked scripts enforce browser setup, URL handling, artifacts, trace capture, and report shape.

## Default Flow

1. Resolve the target URL from the user, deploy report, service docs, or local dev server output.
2. Run the environment check in the same environment that will execute the browser test before installing or changing dependencies:

```sh
sh .ndx/skills/headless-browser-test/scripts/check-headless-browser-env.sh
```

3. Run a smoke test:

```sh
node .ndx/skills/headless-browser-test/scripts/run-headless-browser-test.mjs --url <url>
```

4. Verify the target URL from inside the NDX container before assuming host networking:

```sh
curl -fsS <url> >/dev/null
```

5. For real E2E, write a small JSON scenario and run it with `--spec`.
6. If the user asks for durable repository tests, generate a Playwright template and fill only the marked TODOs:

```sh
sh .ndx/skills/headless-browser-test/scripts/write-playwright-e2e-template.sh test/e2e
```

## Load Only What You Need

* `references/environment.md`: package/runtime checks, missing Chromium or Playwright handling, local vs container URL rules.
* `references/scenario-authoring.md`: scenario JSON format, stable locator contract, and fill-in templates for common tests.
* `references/operation.md`: deployed service testing, artifact paths, failure triage, and final-answer requirements.

## Hard Rules

* Do not run `playwright install`, change package dependencies, or edit `yarn.lock` until `check-headless-browser-env.sh` proves the runtime is missing.
* This skill expects `runtime: ndx-container`. If it is running on the Codex host, use the `.codex` headless-browser-test skill instead.
* Missing Chromium or Playwright inside `runtime: ndx-container` is an agent image problem, not a generated-project dependency problem.
* Do not let automatic `localhost` rewriting change the security model of the page. If browser APIs such as `crypto.randomUUID` require a secure local origin, use `--preserve-localhost`.
* Test rendered behavior that a user can see or operate. Do not assert implementation details.
* Prefer role/name, label, text, alt text, title, and test id locators. Use CSS/XPath only when no stable user-facing or documented test hook exists.
* Keep tests isolated. Do not rely on execution order, shared browser storage, or state left by a previous test.
* Avoid uncontrolled third-party pages and services. Mock or constrain them when they affect the result.
* Prefer auto-waiting locator actions and web-first assertions over manual sleeps or one-shot visibility checks.
* Capture evidence under `test/YYYYMMDD/<HHMMSS>_headless-browser-test/`.
* Final answers must include pass/fail, tested URL, report path, screenshots, and whether the run was smoke-only or scenario-based.
