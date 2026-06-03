---
name: cot-solve
description: Activate for substantial multi-step work where planning state prevents real rework: dependent phases, risky order of operations, ambiguous requirements, or cross-system changes. Do not activate for small obvious edits or ordinary file inspection.
---

## Recognition

Apply this skill only when the task is substantial enough that an explicit
tracked plan will prevent real rework.

Use it when one or more of these are true:
- Three or more distinct execution actions are needed
- Steps have hard dependencies — A must finish before B can start
- A wrong first step requires substantial rework
- Changes cross service, package, persistence, deployment, or UI/runtime boundaries
- Acting before clarifying requirements will send work in the wrong direction
- New required steps appear after inspection

Do not use this skill for:
- One or two straightforward implementation steps
- Purely conversational, explanatory, or review-only responses
- Routine read-before-edit inspection where the change is otherwise obvious
- A small multi-file edit that does not cross architectural or runtime boundaries

## Phase 1 — Resolve unknowns before planning

Inspect before registering implementation steps when the plan depends on facts
you have not verified. Never fill gaps with memory or inference.

- Confirm every file you intend to change actually exists
- Read the actual signature of every function, type, or variable you will reference
- Check the current state of any module the change will affect

If an unknown blocks a correct plan, inspect first with the normal file/search
tools. Do not spend cot_work calls just to say you are about to inspect.

## Phase 2 — Register with cot_work

After resolving planning-critical unknowns, call cot_work before the first
implementation action.
Register the complete plan in dependency order.

Good step: `Add null check in processUser at user.ts:42`  
Bad step: `Handle edge cases` / `Refactor`

Every step must have a single, checkable outcome.
For an active plan, exactly one step must be in_progress and the rest must be
pending or completed. On the first cot_work call, mark the first executable step
in_progress; never send a plan where every step is pending. A terminal plan may
have every step completed and no in_progress step.

## Phase 3 — Execute with evidence rules

Before marking any step completed, satisfy all three:

1. **Evidence** — You inspected the actual file, command output, or
   test result. Memory and prior context do not count.
2. **Scope** — The change matches the step description exactly.
   Nothing beyond it was touched.
3. **Verify** — You confirmed the result by running a command or
   reading output. Never assume success.

If any rule is unsatisfied, keep the step in_progress.
Record what is blocking it only when the plan itself needs to change or the user
needs to know; otherwise inspect or verify directly.

## Phase 4 — Anchor every two steps

After every two completed steps, re-read all pending steps and confirm:

- The original goal is still achievable with the remaining steps
- No earlier change has invalidated a later step
- No new unknowns have appeared

If the plan needs updating, call cot_work with reason before continuing.
Never continue on a stale plan.

## Hallucination recovery

When you recognize you have been building on a wrong assumption:

1. Stop immediately. Never stack more work on a wrong assumption.
2. Revert the affected step to in_progress or insert a new inspect step before it.
3. Inspect the actual current state.
4. Call cot_work with reason to reflect the correction.
5. Resume from the corrected step.

Intent, partial progress, elapsed effort, memory of earlier work,
and plausible-sounding answers are not proof of completion.
Only direct evidence is.
