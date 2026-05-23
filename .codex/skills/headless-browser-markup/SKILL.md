---
name: headless-browser-markup
description: Define or review frontend markup contracts for views that should be easy to verify in headless browsers such as Playwright. Use when creating front views, refactoring UI structure, adding browser tests, or reviewing markup for stable role, label, accessible-name, landmark, and test-id selectors.
---

# Headless Browser Markup

Design DOM that browser tests can target the way users perceive the UI.

## Rule

* Prefer semantic HTML and accessible names so `getByRole`, `getByLabel`, `getByText`, `getByAltText`, and `getByTitle` work without helper selectors.
* Add explicit test ids only for stable non-user-facing anchors, repeated structures, or widgets whose user-facing copy is intentionally volatile.
* Do not couple browser tests to CSS classes, DOM depth, generated ids, or `nth()` ordering unless the contract documents that no stronger locator exists.

## Required

* Expose one page-level `main` region for each view.
* Give major sections, forms, dialogs, tables, lists, and status surfaces machine-checkable semantics.
* Give interactive controls stable accessible names.
* Give repeated items a stable container contract so tests can scope before acting.
* Expose loading, empty, error, and success states through visible semantics or explicit test hooks.

## Load

Read `references/contract.md` whenever editing UI markup or browser tests.
