---
name: repository-package-vendor
description: Enforce the repository reuse rule: search known source repositories directly before implementing, and if reusable code exists, vendor it into packages as a standalone local package instead of using registry installation as the final solution. Use when deciding reuse vs reimplementation.
---

# Repository Package Vendor

Search first. Reimplement last.

## Rule

* Search source repositories directly before implementation.
* If reusable exists, do not reimplement by default.
* Do not finish with direct registry install as substitute for vendoring.
* Vendor target: standalone local package under `packages/`.
* Derived version: `x.y.z-{projectName}.n`.
* Increment derived version only when instructed.
* When a dependency is still needed, add it through the repository's Yarn Plug'n'Play workflow and preserve root `packageManager: "yarn@..."`; never introduce `pnpm`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `npm install`, or `node_modules` assumptions.

## Repository Check

* Search configured Git remotes, workspace package directories, and known
  organization repositories before adding new code.
* Prefer repository files, tags, releases, and package manifests as evidence.
* Do not rely on an internal package catalog service.

## Output

Return search query, repositories checked, candidates, reuse decision, vendor target, versioning action.

## Load

If deciding, read `references/workflow.md`.
