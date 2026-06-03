# Headless Browser Test Operation

Use this when running tests against an actual service and reporting evidence.

## Deployed Service

If the user asks to deploy and test, deploy first with the repository's deployment skill or script. Use the URL printed by the deploy report.

If a service is already running, resolve the URL from one of:

* The latest deploy report.
* `docker compose ps`.
* Service docs under `docs/`.
* The dev server output in the active terminal.

Run smoke:

```sh
node .codex/skills/headless-browser-test/scripts/run-headless-browser-test.mjs --url <resolved-url>
```

Run scenario:

```sh
node .codex/skills/headless-browser-test/scripts/run-headless-browser-test.mjs --url <resolved-url> --spec <scenario.json>
```

## Artifacts

Default output:

```text
test/YYYYMMDD/<HHMMSS>_headless-browser-test/
  report.json
  report.md
  trace.zip
  screenshots/*.png
```

Use `--out <dir>` when the user requests a specific artifact location.

## Failure Triage

When the runner fails:

1. Read `report.md`.
2. Inspect the failure screenshot path printed by the runner.
3. Check `consoleErrors` and `pageErrors` in `report.json`.
4. Open `trace.zip` with Playwright trace tooling when available.
5. If navigation failed, verify the URL from the same environment with `curl -I <url>` or `curl -fsS <url>`.
6. If the locator failed, inspect markup and prefer fixing the UI contract over weakening the test.
7. If a fixed timeout looks tempting, replace it with a specific visible state, URL, response, role, or text assertion.

## Durable Playwright Tests

Use this when the user wants a test committed to the repository instead of one-off browser evidence:

```sh
sh .codex/skills/headless-browser-test/scripts/write-playwright-e2e-template.sh test/e2e
```

Then fill the TODO placeholders in:

```text
test/e2e/playwright.config.ts
test/e2e/tests/smoke.spec.ts
```

The generated test starts a fresh browser context per test, uses role/label/text locators, records trace on first retry, captures screenshots only on failure, and keeps the base URL configurable through `E2E_BASE_URL`.

In the ndx agent image, run it with the globally installed Playwright CLI:

```sh
E2E_BASE_URL=<url> playwright test -c test/e2e/playwright.config.ts
```

## Final Answer

Include:

* Pass/fail.
* Tested URL and final URL when different.
* Whether this was smoke-only or scenario-based.
* Report path.
* Screenshot paths.
* Browser console/page errors, summarized.

Do not paste the whole JSON report unless the user asks.
