---
name: prompt_rewrite
description: Use when a user's prompt should be reinterpreted into a clearer execution prompt through the prompt_rewrite tool's compact rewrite loop.
---

## Purpose

Use `prompt_rewrite` near the start of a turn when the raw user prompt depends
on hidden context, prior conversation flow, project-specific terms, or current
external facts.

The tool rewrites the prompt for weaker local models. It runs a compact
internal loop that may call existing file/web basetools and `session_history`
for prior project/session context. It returns `rewritten_prompt`, `report`,
`tool_calls`, `facts`, `assumptions`, and `ambiguities`. Treat collected tool
output as supporting material and the rewritten prompt as the execution
instruction.

## When to use

Use the tool when any of these are true:

- The user refers to "that", "the previous thing", "same as before", or a
  project-specific feature without restating the target.
- The request may depend on earlier sessions in the same project.
- The request may depend on files in the repository or public web context.
- The request asks for a strategic plan, prompt design, tool behavior, or
  context interpretation rather than a direct edit.
- The user explicitly asks for prompt rewriting or says the model may be weak.
- Current public facts or an explicit URL may materially affect the rewrite.

Skip the tool when the prompt is already a complete, low-risk instruction and
no hidden context changes the next action.

## Workflow

1. Call `prompt_rewrite` with the raw user prompt and a short `reason`.
2. Read `tool_calls` first to see what extra evidence was gathered.
3. Read `facts`, `assumptions`, and `ambiguities` before acting.
4. Use `rewritten_prompt` as the clarified task, but never expand beyond the
   original user intent.
5. If `should_ask_user` is true or ambiguity affects a high-impact choice, use
   `askUserQuestion` before implementation.

## Constraints

- Do not treat assumptions as facts.
- Do not discard the raw user prompt; compare it with the rewrite when scope
  might have expanded.
- Do not call the tool repeatedly for the same prompt unless new evidence has
  arrived.
- The tool may use an internal model call and can break provider prefix-cache
  reuse for that turn.
