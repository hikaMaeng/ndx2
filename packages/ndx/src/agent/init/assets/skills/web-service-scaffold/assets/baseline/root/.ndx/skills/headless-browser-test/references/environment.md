# Headless Browser Test Environment

Use this when deciding whether the current NDX agent runtime can run browser tests.

## Required Runtime

The test runner needs:

* Node.js 20 or newer.
* A Chromium executable.
* The `playwright` Node package, either in the workspace or globally available in the agent image.

Check this first:

```sh
sh .ndx/skills/headless-browser-test/scripts/check-headless-browser-env.sh
```

The script prints:

* Node version and executable path.
* Whether Playwright resolves from the workspace or a global install.
* Chromium candidate paths.
* The browser executable that `run-headless-browser-test.mjs` will use.

If it fails, keep the output in the final answer because the missing component determines the next action.

## Execution Context Matters

This `.ndx` skill is for an NDX agent already running inside the NDX Docker runtime. Do not interpret it from the Codex host perspective.

The NDX image installs Chromium, `playwright`, and `@playwright/test`. A check run from the outer Codex host, WSL shell, or another development container cannot see those image-local packages and is not the relevant check for this skill.

Interpret failures by context:

* `runtime: ndx-container`: expected for this skill. Missing Playwright or Chromium means the agent image/runtime is wrong.
* `runtime: host-or-non-ndx-container`: you are not in the intended execution context. Use the `.codex` headless-browser-test skill for Codex-host testing.

If you must verify the packaged baseline skill from outside the running agent, override the image entrypoint:

```sh
docker run --rm --entrypoint sh <image> -c 'sh /app/dist/server/assets/skills/web-service-scaffold/assets/baseline/root/.ndx/skills/headless-browser-test/scripts/check-headless-browser-env.sh'
```

## Missing Runtime Policy

Do not install anything before the check script fails.

If Playwright is missing in a generated project but the NDX runtime already has the global package, do not add a dependency just for one-off browser evidence.

If the user explicitly asks for a durable project-owned Playwright suite and the package is missing, prefer the repository's package manager and keep lockfile changes intentional:

```sh
yarn add -D playwright
```

If Chromium is missing in an NDX agent image, report the image/runtime problem instead of modifying the generated project. The image is expected to provide Chromium.

If the user explicitly wants local workstation testing and Chromium is missing, ask before installing OS packages.

For durable Playwright Test suites, add the dependency only when the repository does not already provide it:

```sh
yarn add -D @playwright/test
```

Inside the NDX agent image, the Dockerfile provides global `playwright` and `@playwright/test`, exposed through `NODE_PATH=/usr/local/lib/node_modules`. Do not add workspace dependencies just to run the generated template there.

## URL Rules

Use exactly the URL the user gave only after it is reachable from inside the NDX agent container.

When running inside an NDX container, project services exposed on the host through `localhost` or `127.0.0.1` should usually be tested through `host.docker.internal` with the same port. The runner performs this rewrite when `NDX_ROOT` is set.

That rewrite is a convenience, not a proof that the URL works. Verify from the same container:

```sh
curl -fsS http://host.docker.internal:18080 >/dev/null
```

If the target service is in the same Docker Compose network, prefer its service DNS name over host-port routing. If a mock server is started by the test process outside the app container, `host.docker.internal` may point to the wrong host side, especially under Docker Desktop plus WSL. Inspect `/etc/hosts`, find the reachable container gateway, and use it only after `curl` from the app or agent container succeeds.

Preserve localhost when the browser itself runs with host networking and the page must remain a secure local origin. Chromium treats `http://localhost` as a secure context, but `http://host.docker.internal` is not equivalent for APIs such as Web Crypto:

```sh
HEADLESS_BROWSER_PRESERVE_LOCALHOST=1 node .ndx/skills/headless-browser-test/scripts/run-headless-browser-test.mjs --url http://localhost:18080
node .ndx/skills/headless-browser-test/scripts/run-headless-browser-test.mjs --url http://localhost:18080 --preserve-localhost
```

Examples:

```sh
node .ndx/skills/headless-browser-test/scripts/run-headless-browser-test.mjs --url http://localhost:18080
node .ndx/skills/headless-browser-test/scripts/run-headless-browser-test.mjs --url http://host.docker.internal:18080
```

## When To Start A Server

If the requested page is a local app and no server is running, start the app using the repository's documented workflow. For this scaffold, prefer deploy output for Docker checks and the package scripts for dev-server checks.

Do not invent ports. Use the scaffold docs, deploy report, running process output, or `docker compose ps`.
