---
name: monorepo-architecture-guard
description: Enforce the repository monorepo contract: TypeScript latest stable, Turbo plus Yarn Plug'n'Play workspace, exact versions, repository package reuse, package and app boundaries, service-module shape, dist manifest targets, env-schema usage, deploy-script conventions, and React plus shadcn/ui plus Express wiring. Use when creating or reviewing packages, app service modules, package.json, tsconfig, workspace imports, env handling, frontend and backend integration, or monorepo configuration.
---

# Monorepo Architecture Guard

Apply repo-only constraints. Skip generic coding knowledge.

## Stack

* TS latest stable.
* Turbo monorepo. Define task `inputs` and `outputs`. Document remote-cache strategy in root README.
* Yarn 4+ with Plug'n'Play: `nodeLinker: pnp` and `enableGlobalCache: true`.
* Root `package.json` must declare `packageManager: "yarn@..."`.
* Root `.yarnrc.yml` owns package-manager behavior; do not add npm registry override files for workspace rules.
* `yarn.lock`: committed; immutable in CI/runtime through `yarn install --immutable`.
* Dependency changes use Yarn commands only. Do not use `pnpm`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `npm install`, or workspace `node_modules` as a required runtime path.
* Reuse checks search source repositories directly; do not depend on a package catalog service.

## Boundaries

* `packages/`: framework-agnostic libraries only.
* `apps/`: service modules only; no business logic in wiring-only shells outside service modules.
* Apps may depend on packages; packages must never depend on apps.
* Never import from `apps/` into `packages/`.
* Cross-package imports: workspace names only; never relative cross-package paths.
* App modules own orchestration, framework lifecycle, HTTP/static serving, composition, and process wiring.
* Domain rules, invariants, cross-request state interpretation, and framework-independent product logic belong in the paired domain package.
* Do not hide app domain logic in generic shared packages.

## Code Shape

* Keep code direct; do not create functions, classes, modules, or files whose abstraction is effectively just their name.
* Prefer one clear exported or top-level function over a chain of private helpers when the helpers are used only once.
* Allow first-level decomposition by default; nested private-helper decomposition requires concrete duplication, a second caller, or a real boundary such as parsing, validation, persistence, network IO, or a nontrivial algorithm.
* Do not create private helpers for one expression, one method call, one regular expression, one `trim`/`toLowerCase`, or one filename sanitization line.
* Repeated one-line expressions still stay inline unless naming captures a domain invariant or prevents a real bug.
* File-local helpers that are not exported and called once are violations unless they isolate a meaningful boundary.
* Avoid classes unless identity, mutable lifecycle, polymorphism, or resource ownership is required.

## Service Module

* One service = one app module.
* Default shape: `apps/<service>/src/server` + `apps/<service>/src/front`.
* Each `apps/<service>` must pair with exactly one domain package at `packages/<service>_domain`.
* Do not create additional domain-related packages for the same app.
* `src/front`: Vite-built.
* Prod serving: only `src/server` Express serves built front assets.
* Final deployment/container target: server runtime artifact.
* FE remains independently buildable.

## Package Rules

* Domain package shape: `packages/<service>_domain/src/common`, `src/server`, and `src/front`.
* `src/common`: runtime-neutral domain code shared by server and front.
* `src/server`: server-only domain code; must not import from `src/front`.
* `src/front`: front-only domain code; must not own app UI composition.
* Non-domain packages should be cohesive and standalone; avoid dependencies on other packages unless the abstraction is durable and not app-specific.
* No phantom dependencies; declare every used dep.
* Versions: exact only.
* In `packages/`, framework deps such as `react`, `tailwindcss`, `@radix-ui/*`, `class-variance-authority`, `clsx`, and `tailwind-merge` belong in `peerDependencies`.
* `main` / `module` / `types` -> `dist/`.
* `tsconfig` path names == workspace package names.
* Node runtime resolution must work without tsconfig-only aliasing.
* Prefer a standard `npm run deploy` script that wraps local build plus compose refresh.

## Runtime

* FE stack assumption: React + shadcn/ui + Tailwind CSS + Radix UI primitives; verify major compatibility on bumps.
* Frontend implementation must use shadcn/ui components by default for UI primitives and composed controls. Do not introduce another UI component framework unless the user explicitly overrides this project contract.
* Dev: explicit Vite proxy to BE on separate ports.
* Prod: BE serves built FE static assets.
* BE: Express only.
* Port source: env only; range `10000-59999`; never hardcode.
* Read env only after explicit schema validation.

## Output

Return violated rules, affected files, required fixes, residual risk.

## Load

If checking, read `references/checklist.md`.
