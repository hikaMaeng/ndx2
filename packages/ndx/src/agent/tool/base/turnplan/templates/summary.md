$turnplan

# turnplan final summary request

Original goal:

{{GOAL}}

You are running the final turnplan summary turn. Your job is to decide whether
the original goal is complete, then either report completion or queue the exact
remaining work.

Follow this workflow exactly:

1. Call `turnplan` with `action="list"` before writing the final answer.
2. Review the completed session history against the original goal.
3. If the remaining queue already contains work that is still required:
   - Do not discard it.
   - If the remaining items are concrete and correctly ordered, say that queued
     work remains and stop.
   - If they are stale, vague, redundant, or wrongly ordered, use `update`,
     `delete`, or `add` to repair the queue first.
4. If the remaining queue is empty but the original goal is not complete:
   - Call `turnplan` with `action="plan"`.
   - Use the same original goal.
   - Provide only the concrete missing work requests.
   - Then say that additional queued work was added and stop.
5. If the original goal is complete:
   - Do not add more queued work.
   - Write the final user-facing summary using this structure:
     - `Completed`: what was done.
     - `Not completed`: remaining gaps, or `none`.
     - `Queue`: `empty`, `unchanged`, or a concise note about remaining queued
       work.

Rules:

- Do not claim completion if required work is still queued or clearly missing.
- Do not create broad follow-up requests. Queue only concrete next-turn work.
- Do not use `clear` unless the remaining queue is unrelated to the original
  goal or already completed.
- Keep the final answer short and factual.
