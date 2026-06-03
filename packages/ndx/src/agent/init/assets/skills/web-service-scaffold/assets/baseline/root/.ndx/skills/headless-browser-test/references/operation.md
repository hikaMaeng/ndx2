# Headless Browser Test Operation

Use this when running tests against an actual service and reporting evidence.

## Deployed Service

If the user asks to deploy and test, deploy first with the repository's deployment skill or script. Use the URL printed by the deploy report.

This `.ndx` skill is the right tool when the NDX agent inside Docker is testing another project created or managed by NDX. If Codex is testing NDX itself from the host, use the `.codex` skill instead.

If a service is already running, resolve the URL from one of:

* The latest deploy report.
* `docker compose ps`.
* Service docs under `docs/`.
* The dev server output in the active terminal.

Before opening Chromium, verify the resolved URL from inside the NDX agent container. Host-side success is not enough:

```sh
curl -fsS <resolved-url> >/dev/null
```

Run smoke:

```sh
node .ndx/skills/headless-browser-test/scripts/run-headless-browser-test.mjs --url <resolved-url>
```

Run scenario:

```sh
node .ndx/skills/headless-browser-test/scripts/run-headless-browser-test.mjs --url <resolved-url> --spec <scenario.json>
```

If the target service is reachable through a Compose service name, prefer that URL. If it is exposed through a host port, `localhost` is automatically rewritten to `host.docker.internal` while `NDX_ROOT` is set. Use `--preserve-localhost` only when Chromium is intentionally running in a host-network arrangement and the page must remain a secure local origin.

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
6. If a generated app container must reach a mock or callback server started by the test process, verify that URL from the app container. On Docker Desktop plus WSL, `host.docker.internal` can point to the Windows host while the mock listens on the WSL-side gateway.
7. If the locator failed, inspect markup and prefer fixing the UI contract over weakening the test.
8. If a fixed timeout looks tempting, replace it with a specific visible state, URL, response, role, or text assertion.

## Complex E2E

Use the JSON runner for simple click/fill/assert paths. Write a one-off Playwright script under `test/YYYYMMDD/<HHMMSS>_<name>/` when the scenario needs any of these:

* A mock model/provider server or WebSocket choreography.
* Temporary NDX settings changes that must be restored in `finally`.
* Assertions across browser UI, socket messages, model request payloads, server logs, and generated artifacts.
* Scoped locators that the JSON format cannot express cleanly.

For model/tool flows, assert both sides of the contract when possible: the browser-visible result and the backend/model request sequence that proves the turn continued for the right reason. If the script adds a temporary provider or model to NDX settings, restore the original settings before reporting success.

## Durable Playwright Tests

Use this when the user wants a test committed to the repository instead of one-off browser evidence:

```sh
sh .ndx/skills/headless-browser-test/scripts/write-playwright-e2e-template.sh test/e2e
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
* Any temporary settings, mock servers, or container-network overrides used.

Do not paste the whole JSON report unless the user asks.
