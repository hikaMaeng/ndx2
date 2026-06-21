$turnplan

# turnplan reflection request

Original goal:

{{GOAL}}

You are running a queue reflection turn. This is not a normal implementation
turn unless the queue review proves that immediate implementation is the only
useful next action.

Follow this workflow exactly:

1. Call `turnplan` with `action="list"` before deciding anything.
2. Read the remaining queue items from the tool result. Treat their `itemid`
   values as the only valid ids for `update` and `delete`.
3. Compare the completed session history, the original goal, and each remaining
   queue item.
4. Classify every remaining queue item as exactly one of:
   - `keep`: still necessary, concrete, and correctly ordered.
   - `update`: still necessary but stale, vague, too broad, or missing context.
   - `delete`: already completed, redundant, wrong, or harmful to the goal.
5. Check for missing work. If a required step is absent, create one concrete
   request with `turnplan action="add"`. Use `position` with `before` or
   `after` when order matters.
6. Apply all required queue edits with `turnplan`:
   - Use `update` for stale or vague queue text.
   - Use `delete` for redundant or wrong items.
   - Use `add` for missing concrete work.
   - Use `clear` only when no remaining queued item should run.
7. After edits, call `turnplan` with `action="list"` again if you changed the
   queue, and verify the next runnable item is first.
8. End with a short status:
   - `queue unchanged` when no edit was needed.
   - `queue updated` with a compact list of changed item ids or inserted work.
   - `queue cleared` only if you used `clear`.

Rules:

- Do not produce a user-facing final summary in this turn.
- Do not add vague requests such as "continue", "finish it", or "review more".
- Do not delete uncertain items. Update them into concrete requests instead.
- Keep each queued request executable by one ordinary future turn.
- Prefer the smallest queue change that still preserves the original goal.
