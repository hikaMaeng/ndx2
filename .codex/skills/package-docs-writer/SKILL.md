---
name: package-docs-writer
description: Enforce the repository package documentation contract. Use when creating or updating package README, docs pages, navigation tables, API docs, usage docs, constraints, internals, or testing docs. Keep content terse; keep only repo-specific contracts, paths, exceptions, and decisions.
---

# Package Docs Writer

Optimize for retrieval, not pedagogy.

## Required

* Every package: `README.md` + `docs/`.
* README first line: one-line summary.
* README must include nav table with links for purpose, API, constraints, testing.
* Required doc set: `overview`, `architecture`, `api`, `usage`, `constraints`, `internals`, `testing`.
* If a package renders UI, document the browser-test markup contract in `docs/constraints.md` and `docs/testing.md`.

## Writing Rule

* Keep README index-like.
* Put durable contracts in docs, not comments.
* For UI packages, record only durable locator contracts: landmarks, accessible naming, approved test ids, and known exceptions.
* Code comments: anchors only.
* Add JSDoc only when an exported API needs a durable contract that is not
  already clear from its name and type.
* TypeDoc optional; do not commit generated output.
* Drop generic explanations the model already knows.

## Output

Return missing docs, generated docs, structural gaps.

## Load

If writing, read `references/templates.md`.
