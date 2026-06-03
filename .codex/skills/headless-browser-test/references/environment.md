# Headless Browser Test Environment

Use this when deciding whether the current workspace can run browser tests.

## Required Runtime

The test runner needs:

* Node.js 20 or newer.
* A Chromium executable.
* The `playwright` Node package, either in the workspace or globally available in the agent image.

Check this first:

```sh
sh .codex/skills/headless-browser-test/scripts/check-headless-browser-env.sh
```

The script prints:

* Node version and executable path.
* Whether Playwright resolves from the workspace or a global install.
* Chromium candidate paths.
* The browser executable that `run-headless-browser-test.mjs` will use.

If it fails, keep the output in the final answer because the missing component determines the next action.

## Execution Context Matters

The Dockerfile installs Chromium, `playwright`, and `@playwright/test` inside the `apps/ndx` image. A check run from the outer Codex host, WSL shell, or another development container cannot see those image-local packages.

Interpret failures by context:

* `runtime: ndx-container`: missing Playwright or Chromium means the image/runtime is wrong.
* `runtime: host-or-non-ndx-container`: missing Playwright or Chromium only describes the current host process. It does not prove the `apps/ndx` Dockerfile is missing those packages.

For the ndx app image, verify the packaged baseline skill from inside the image:

```sh
docker run --rm --entrypoint sh <image> -c 'sh /app/dist/server/assets/skills/web-service-scaffold/assets/baseline/root/.ndx/skills/headless-browser-test/scripts/check-headless-browser-env.sh'
```

## Missing Runtime Policy

Do not install anything before the check script fails.

If Playwright is missing in a normal scaffold workspace, prefer the repository's package manager and keep lockfile changes intentional:

```sh
yarn add -D playwright
```

If Chromium is missing in an ndx agent image, report the image/runtime problem instead of modifying the project. The image is expected to provide Chromium.

If the user explicitly wants local workstation testing and Chromium is missing, ask before installing OS packages.

For durable Playwright Test suites, add the dependency only when the repository does not already provide it:

```sh
yarn add -D @playwright/test
```

Inside the ndx agent image, the Dockerfile provides global `playwright` and `@playwright/test`, exposed through `NODE_PATH=/usr/local/lib/node_modules`. Do not add workspace dependencies just to run the generated template there.

## URL Rules

Use exactly the URL the user gave when it is already reachable from the current process.

When running inside an ndx container, project services exposed on the host through `localhost` or `127.0.0.1` should usually be tested through `host.docker.internal` with the same port. The runner performs this rewrite when `NDX_ROOT` is set.

Examples:

```sh
node .codex/skills/headless-browser-test/scripts/run-headless-browser-test.mjs --url http://localhost:18080
node .codex/skills/headless-browser-test/scripts/run-headless-browser-test.mjs --url http://host.docker.internal:18080
```

## When To Start A Server

If the requested page is a local app and no server is running, start the app using the repository's documented workflow. For this scaffold, prefer deploy output for Docker checks and the package scripts for dev-server checks.

Do not invent ports. Use the scaffold docs, deploy report, running process output, or `docker compose ps`.
