---
name: cot-solve
description: >
  Activate when steps have dependencies, a wrong first step causes
  significant rework, changes span multiple files or systems,
  requirements are ambiguous before acting, or any file, function,
  or type is assumed to exist without verification. Do NOT activate
  for single-step or immediately verifiable tasks.
---

## Recognition

Apply this skill when ANY of the following are true:
- Steps depend on each other — A must finish before B can start
- A wrong first step requires substantial rework
- Changes touch multiple files, modules, or systems
- Acting before clarifying requirements will send work in the wrong direction
- Any file, function, or type is assumed to exist but not yet confirmed

## Phase 1 — Resolve unknowns before planning

Inspect before writing any step. Never fill gaps with memory or inference.

- Confirm every file you intend to change actually exists
- Read the actual signature of every function, type, or variable you will reference
- Check the current state of any module the change will affect

If something is unknown, register an inspect step first. Never write a plan step for something unconfirmed.

## Phase 2 — Register with cot_work

After resolving unknowns, call cot_work before doing any work.
Register the complete plan in dependency order.

Good step: `Add null check in processUser at user.ts:42`  
Bad step: `Handle edge cases` / `Refactor`

Every step must have a single, checkable outcome.
Exactly one step in_progress at all times. All others pending.

## Phase 3 — Execute with evidence rules

Before marking any step completed, satisfy all three:

1. **Evidence** — You inspected the actual file, command output, or
   test result. Memory and prior context do not count.
2. **Scope** — The change matches the step description exactly.
   Nothing beyond it was touched.
3. **Verify** — You confirmed the result by running a command or
   reading output. Never assume success.

If any rule is unsatisfied, keep the step in_progress.
Record what is blocking it before the next tool call.

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