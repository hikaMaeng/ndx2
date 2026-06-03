---
name: web-service-scaffold
description: Use only when explicitly invoked as $web-service-scaffold to run the bundled web-service scaffold script.
---

# Web Service Scaffold

Turn a web-service request into a copied baseline scaffold. The scaffold is a
platform baseline, not a full product implementation. This NDX skill owns
web-service defaults; the global `AGENTS.md` does not.

## Scope Control

* Only ask for the service name if it is missing.
* Do not ask for target directory by default. Use the current working directory
  as the target repository root.
* Do not ask whether this is a new or existing repository. Detect it: if the
  current working directory has no `.git/`, run `git init`; otherwise preserve
  and extend the existing repository.
* Do not invent a product domain, workflow, data model, or feature set from a
  vague scaffold request.
* Default scaffold surface is deliberately small:
  * Express health endpoint.
  * Vite React shadcn/ui shell with one accessible main view.
  * Minimal Docker deploy path.
  * Minimal docs and tests proving the scaffold contract.
* If the user asks for a product feature in the same request, run the scaffold
  script first, then stop and report the scaffold result unless the user
  explicitly asks to continue into feature implementation.
* Avoid hand-written scaffold generation. The baseline is a one-shot copy from
  bundled assets.

## Scope

* Use the current working directory as the target repository root.
* Use the bundled script as the scaffold implementation:
  `<this-skill>/scripts/install_project_ndx.sh "$PWD" <service-name>`.
* First action after extracting the service name: run the bundled script.
* Do not try `scripts/install_project_ndx.sh` from the target repository for a
  new empty scaffold; it does not exist until after the baseline is copied.
* Do not read checklist, markup contract, companion skills, package files, or
  repository tree before running the script for a scaffold-only request.
* The script creates the Git repository when `.git/` is absent, installs the
  project contract, copies the complete baseline root from
  `assets/baseline/root`, substitutes service placeholders, generates
  `yarn.lock` from the bundled lock template, and creates the initial
  `agenttest` suite/report/summary.
* `assets/baseline/root` is the source of truth. It includes root `AGENTS.md`,
  `.ndx/skills`, monorepo config, service source, Docker files, docs, and
  scaffold test artifacts. Do not copy `AGENTS.md` or `.ndx` through a separate
  path.
* Do not hand-create baseline scaffold files that already exist under
  `assets/baseline/root`.
* `yarn.lock` is generated mechanically from `assets/yarn/yarn.lock.base` and
  the target manifests. Do not run Yarn just to create it during scaffolding.
* Do not run `yarn install`, `yarn build`, `yarn test`, `npm run deploy`,
  browser checks, or `git commit` after the scaffold script unless the user
  explicitly asks for verification, deployment, or commit.
* Do not generate project files outside a Git repository.
* One service = one app module.
* App shape: `src/server` + `src/front`.
* One service app = one generated domain package:
  `apps/<service>` pairs with `packages/<service>_domain`.
* The generated domain package uses `src/common`, `src/server`, and `src/front`.
* Apps may depend on packages; packages must never depend on apps.
* App modules own framework lifecycle and orchestration. Domain rules,
  invariants, and framework-independent product logic belong in the paired
  domain package, not in additional domain packages.

## Non-Negotiable

* Git repository creation is the first filesystem mutation for a new scaffold:
  it is handled by the bundled install script.
* Follow repo `AGENTS.md`.
* Let the script copy `AGENTS.md` and `.ndx/skills` from
  `assets/baseline/root` together with the rest of the baseline.
* The copied baseline already contains monorepo, Docker, docs, test, and
  headless-browser-friendly markup contracts.
* Frontend implementation must use shadcn/ui components, Tailwind CSS, and
  Radix UI primitives by default. Do not introduce another UI component
  framework unless the user explicitly overrides this project contract.
* Prefer vendoring reusable internal packages over reimplementation when relevant.
* Scaffold Yarn 4+ Plug'n'Play only: root `packageManager: "yarn@..."`, `.yarnrc.yml` with `nodeLinker: pnp`, and dependency changes through Yarn commands after the scaffold when requested.
* Do not create `pnpm-lock.yaml`, `pnpm-workspace.yaml`, package-manager migrations, or workspace `node_modules`; do not run `npm install` as the dependency workflow.
* Create standard `npm run deploy`, but do not execute it during fast scaffold unless explicitly requested.

## Required Output State

* Repo root has a web-service `AGENTS.md` copied from `assets/baseline/root`.
* Copied `AGENTS.md` includes the direct-code abstraction budget: no one-line
  private helpers, no single-use helper chains, no nested helper decomposition
  without concrete duplication or a meaningful boundary, and no namespace-only
  classes.
* Repo `.ndx/skills/` contains the web-service companion skill set copied from
  `assets/baseline/root/.ndx/skills`.
* Baseline files were copied from `assets/baseline/root` by the script in one
  pass, not reauthored manually.
* `apps/<service>` exists and is wired.
* `packages/<service>_domain` exists, is wired as the app's single domain
  package dependency, and exposes `src/common`, `src/server`, and `src/front`.
* Front is a minimal Vite-built shadcn/ui shell, and prod serving is only
  through Express server.
* Front markup exposes the small set of landmark, heading, and state contracts
  needed for scaffold smoke tests.
* Docker assets and root compose integration exist.
* Docs are written during scaffolding, not later.
* Test suite and strict JSON report exist for scaffold contract checks.
* No install/build/test/deploy/browser/commit step was run unless explicitly requested.

## Completion Rule

For a scaffold request, completion is the successful return of
`<this-skill>/scripts/install_project_ndx.sh "$PWD" <service-name>`
plus the script's own required-file checks and generated scaffold
suite/report/summary. Stop there. Do not run dependency install, build, tests,
deploy, browser checks, or commit unless the user explicitly asks for those
actions.
