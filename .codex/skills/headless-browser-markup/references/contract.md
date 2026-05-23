# Headless Browser Markup Contract

Use this contract when building or reviewing a frontend view that will be exercised in a headless browser.

## Locator-First Design

* Make the primary locator path one of: `getByRole(name)`, `getByLabel`, `getByText`, `getByAltText`, `getByTitle`.
* Treat `getByTestId` as a secondary contract for stable structure that users do not identify by text or role.
* Design for strict locators. A control should be uniquely identifiable inside its intended scope without relying on `.first()`, `.last()`, or `nth()`.

## Page Skeleton

* Use real landmarks: `header`, `nav`, `main`, `aside`, `footer`, `form`, `section`.
* Keep one top-level `main` per view.
* Give major sections visible headings. When multiple regions share the same landmark type, give each a unique accessible name, usually via `aria-labelledby`.
* Prefer native elements before adding ARIA roles.

## Interactive Controls

* Use real `button`, `a`, `input`, `select`, `textarea`, `details`, `summary`, `dialog` elements when they match the behavior.
* Do not implement clickable `div` or `span` controls when a native control exists.
* Give icon-only buttons an accessible name.
* Keep button and link labels specific inside their scope. If many rows have an `Edit` action, expose a stable row container so tests can scope to the row first.

## Forms

* Give every form control an associated label or another stable accessible name.
* Do not use placeholder text as the only label.
* Link helper, validation, and error copy with `aria-describedby` when it explains the control state.
* Expose invalid, required, disabled, and busy states semantically.
* Keep submit, reset, close, and destructive actions uniquely named within their active scope.

## Collections

* Use list semantics for card collections and table semantics for tabular data.
* Give each item or row a stable container and a primary identifying text node or heading.
* Place row-level actions inside the row container so tests can scope to the item and then query actions by role.
* Expose empty states as visible content, not absence alone.

## Async And Feedback States

* Expose loading states through `progressbar`, `status`, or an explicit test id when the UI is a skeleton without meaningful text.
* Expose success and neutral updates through `role="status"` when appropriate.
* Expose urgent errors through `role="alert"` when they should be announced immediately.
* Keep toasts, banners, and inline messages queryable without class-based selectors.

## Dialogs And Composite Widgets

* Give dialogs a dialog role and an accessible name, usually from the dialog title.
* Keep a visible close control inside the dialog.
* Prefer native controls first. When building custom tabs, accordions, menus, comboboxes, or similar widgets, follow the WAI-ARIA APG pattern roles, states, relationships, and keyboard behavior.
* Keep trigger-panel relationships explicit with attributes such as `aria-controls`, `aria-expanded`, and `aria-labelledby` when the pattern uses them.

## Test Id Contract

* Add test ids only where role, label, text, or title would be ambiguous, intentionally unstable, or absent.
* Prefer ids on stable containers and machine-only anchors, not every child element.
* Keep names domain-specific and durable, such as `orders-table`, `order-row`, `filters-panel`, `loading-state`.
* Do not encode styling, DOM order, or ephemeral copy into test ids.

## Anti-Patterns

* CSS-class, DOM-depth, or XPath selectors as the primary browser-test contract.
* Multiple identical unnamed landmarks or dialogs.
* Repeated controls that are only distinguishable by index.
* Hidden semantics that conflict with the visible UI without a documented reason.
* View states that can only be asserted by waiting for elements to disappear without a positive replacement signal.
