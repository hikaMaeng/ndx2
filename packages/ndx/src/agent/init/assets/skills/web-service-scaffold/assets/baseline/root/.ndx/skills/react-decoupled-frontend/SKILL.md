---
name: react-decoupled-frontend
description: Use when designing, implementing, reviewing, or refactoring a React front end to prevent root/global-state coupling, excessive App-level handlers, prop/listener churn, poor partial rendering, or fake refactors that only move complexity into a large hook or wrapper.
metadata:
  short-description: React decoupling rules
---

# React Decoupled Frontend

Use this skill to counter the common failure mode of building React apps as one global model rendered by one root component. The goal is not merely smaller files. The goal is feature ownership, render isolation, and updates that stop at the smallest correct subtree.

## Core Rule

Do not make `App` or another root component the owner of feature state just because that is the easiest way to wire callbacks.

Root components should compose layout, providers, routing/surface selection, and truly global signals. Feature state, effects, event handlers, socket/API workflows, modals, drafts, form state, scroll state, and resize state belong to the feature or instance that renders and uses them.

## Default Bias To Reject

Reject these model-friendly but UI-hostile patterns:

- One root component owns all state and passes it downward.
- One root component creates most event handlers and listeners.
- Children are mostly renderers with large prop bags.
- Feature folders exist, but real behavior still lives in the root.
- Sibling coordination is implemented by parent closures instead of narrow signals.
- Desktop/mobile variants instantiate duplicate controllers for the same state.
- Refactoring creates `useBigApp`, `AppRoot`, or a root-level controller that only hides complexity.
- A global modal owns instance-specific form data without a source instance key.

## Ownership Placement

Place ownership where rerender impact should stop.

- Menu state belongs to the menu section, menu feature, or menu row that displays it.
- Main-surface state belongs to the active surface or surface instance.
- Sidebars or panels that only exist for a surface belong under that surface feature.
- Form/input/draft/attachment/model-selection state belongs to the form or instance using it.
- Socket tokens, live status, stream buffers, request state, and interruption state belong to the live surface/session that uses them.
- Modal form state belongs to the feature that opens and submits the modal. A shared modal layer may host DOM, but should not own every workflow.
- Parent state is justified only when the parent itself renders differently or when multiple children must subscribe to the same app-level fact.

## Communication Rules

Prefer intent signals over parent-owned callback meshes.

- Use narrow commands such as `openItem(id)`, `openDraft(id)`, `requestDelete(id)`, or `openModal({ kind, sourceKey })`.
- Signals should carry intent and IDs, not fully assembled JSX, large state objects, or feature internals.
- Receiving regions subscribe and decide how to update themselves.
- Cross-region state should use context or external-store style subscriptions when root rerendering would be wasteful.
- If a modal result must return to a specific feature instance, include the source instance key in the signal.

## Real Refactor Criteria

A refactor is real only when ownership changes.

Acceptable:
- State/effects move from root to the feature that uses them.
- Buttons/forms call handlers owned by their feature.
- Cross-region coupling becomes a small signal/store API.
- Top-level folders are moved under their owning feature when they are not independent regions.
- Root imports region shells, not feature internals.

Not acceptable:
- Moving a 1000-line root body into `useAppController`.
- Moving root JSX into `AppRoot` while preserving the same root-owned state.
- Keeping root-created handlers and passing them through new wrapper components.
- Splitting files by visual area while retaining one global render model.

## Refactor Workflow

1. Inspect the root component for state, effects, refs, handlers, socket/API calls, modal state, and render helper functions.
2. Classify each item by the feature or instance that actually uses it.
3. Move feature handlers to the components that own the buttons/forms.
4. Move feature state/effects to the feature controller or instance component.
5. Replace parent callback chains with narrow signals where siblings must coordinate.
6. Move feature-owned sidebars, panels, modals, and subfeatures under the owning feature folder.
7. Ensure duplicate visual variants share one controller when they represent the same state.
8. Delete root-level hooks/wrappers that only served as hiding places.
9. Remove obsolete top-level folders after imports are moved.
10. Run lint/typecheck/build and verify key interactions after each ownership shift.

## Render Isolation Checks

Before finishing, verify the update boundaries:

- Typing in a surface input does not rerender the menu.
- Expanding/collapsing menu rows does not rerender the main surface.
- Live/streaming events update only the affected surface instance.
- Opening a modal does not reset unrelated surface or menu state.
- Resizing a feature-owned panel rerenders only that feature instance.
- Desktop/mobile versions do not create duplicate subscriptions, sockets, or controllers.

Use React DevTools Profiler when available. Temporary render counters are allowed while diagnosing, but remove them before finishing.

## Structural Checks

- Root file is small because it owns little, not because logic moved to a root-level mega hook.
- Root has no feature-specific `handleX`, `renderX`, socket listener, submit handler, rename/delete handler, or modal form state.
- Root state is limited to layout, bootstrapping, providers, routing/surface selection, and app-level signals.
- Feature folders contain their own controllers/hooks, modals, socket/API wrappers, and subfeatures.
- A folder at top level represents an independent app region. If it exists only inside another region, it is nested under that owner.

## Review Questions

- Which component becomes meaningless if this state disappears? That component probably owns it.
- Does this handler exist only so a parent can close over state for a child? Move it down or replace it with a signal.
- Will this update be visible outside one feature or instance? If not, keep it out of the root.
- Is this file split reducing root ownership, or only reducing root line count?
- Is the design optimized for React partial rendering, or for implementation convenience?
