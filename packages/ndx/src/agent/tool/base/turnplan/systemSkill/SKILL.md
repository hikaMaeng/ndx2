---
name: turnplan
description: Use when a goal should be split across multiple queued session turns with reflection turns between work turns.
---

# turnplan

Use `turnplan` when a single prompt/tool-call chain is likely to be too large,
too long, or too prone to reasoning loops, and the work can be advanced by
several ordinary queued turns.

Do not use it for short work that can finish in the current turn.

## Core model

`turnplan` only edits the current session request queue. It does not run a
separate scheduler, hook, or special turn mode. Every queued item runs later as
a normal user request.

When creating a plan, provide:

- `goal`: the final outcome the whole queued sequence is meant to reach.
- `requests`: concrete future work requests.

For requests `A`, `B`, and `C`, the tool queues:

```text
A
reflection request
B
reflection request
C
final summary request
```

Reflection requests are ordinary turns. They invoke this skill with
`$turnplan`, remind the model of the original goal, inspect completed work
through session history, compare the remaining queue to the goal, and use
`turnplan` again if the queue needs adjustment.

## Queue management

The model performs the reflection analysis. The function tool only exposes the
queue controls needed to inspect and change the remaining request queue.

Use:

- `list` before modifying existing queued work when item ids matter.
- `add` for one concrete request.
- `update` when a queued request is still useful but stale.
- `delete` when a queued request is redundant or wrong.
- `clear` only when the remaining queue should be discarded.

During a reflection request:

- Call `turnplan` with `action="list"` to see the remaining queue.
- Compare completed session history with each remaining queued item.
- Update queued items whose request text is stale or too vague.
- Delete queued items that are redundant, already completed, or wrong.
- Insert new queued items before/after anchors when the remaining plan has a
  gap.
- Keep the queue ordered so the next runnable item is first.

Keep queued requests actionable. A queued work request should tell the next turn
what to inspect, implement, verify, or decide. Avoid vague requests like
"continue" unless the previous turn made the next action unambiguous.
