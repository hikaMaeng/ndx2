# Web-Service Scaffold Checklist

## Project Contract

* current working directory used as target repository root
* `git init` completed before scaffold files were generated
* repo is a Git repo
* service name is explicit
* product feature scope is not invented by the scaffold
* complete baseline root copied from `assets/baseline/root`
* web-service project contract installed from the same baseline copy:
  * root `AGENTS.md`
  * repo `.ndx/skills/`

## Monorepo Root

* TS + Turbo + Yarn Plug'n'Play workspace state exists
* root `package.json` declares `packageManager: "yarn@..."`
* root `package.json` declares workspaces for `apps/*` and `packages/*`
* root `package.json` exposes `build`, `test`, `lint`, and `deploy`
* root `.yarnrc.yml` sets `nodeLinker: pnp` and `enableGlobalCache: true`
* root `turbo.json` exists with explicit task `inputs` and `outputs`
* root `tsconfig.json` exists
* root README documents remote-cache strategy
* root `docs/` exists
* dependency changes use Yarn commands only when dependency work is requested
* no `pnpm-lock.yaml`, `pnpm-workspace.yaml`, package-manager migration, `npm install` dependency workflow, or required workspace `node_modules`

## Service

* `apps/<service>` created
* `src/server` + `src/front` created
* server exposes minimal health endpoint
* front is a minimal shadcn/ui shell, not an invented product UI
* Express serves built front in prod
* front markup follows the headless-browser smoke-test contract

## Docker And Deploy

* root compose + module `docker/` integrated
* Dockerfile copies prebuilt `dist/` only
* `npm run deploy` exists
* deploy is not executed during fast scaffold unless explicitly requested

## Docs And Tests

* minimal package docs written for the scaffold contract
* `agenttest` suite written at `test/YYYYMMDD/HHMMSS_suite-name.json`
* strict JSON report finalized at `test/YYYYMMDD/HHMMSS_report.json`
* Markdown summary derived at `test/YYYYMMDD/HHMMSS_summary.md`
* no dependency install, build, test, deploy, browser check, or Git commit was run unless explicitly requested
