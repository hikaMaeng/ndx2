---
name: ask-user-question
description: Use when missing user information materially changes the next action and the askUserQuestion tool is available.
---

## Purpose

Use `askUserQuestion` to get information that cannot be safely inferred and
would change the next step, output, permission boundary, account choice,
configuration, or user-facing result.

Do not ask because you are merely uncertain. First inspect files, docs, logs,
tool output, or durable session history when the answer can be discovered
without the user.

## When to ask

Ask the user when any of these are true:

- Two or more valid implementation paths have different user-visible tradeoffs.
- A destructive or hard-to-reverse action depends on user preference.
- Required input is private, unavailable in the workspace, or account-specific.
- Continuing without the answer risks doing substantial work in the wrong
  direction.
- The user explicitly asked you to ask before proceeding.

Do not ask when a conservative default is obvious, the missing detail has low
impact, or a local inspection/tool call can resolve the question.

## Question shape

Ask one question by default. Use two or three only when the answers are
independent and all are needed before continuing.

Every question must have:

- `id`: stable `snake_case`, used only for mapping the response.
- `header`: short UI label.
- `question`: one clear question. It may include necessary context, but keep
  it focused enough that the user can answer without reading a spec.
- `inputType`: `single_choice`, `free_text`, or `secret`.

## Single-choice questions

Use `single_choice` when the likely answers are mutually exclusive and can be
explained as choices.

Rules:

- Provide two to four options.
- Put the recommended option first when a recommendation is justified.
- Add `(Recommended)` to the recommended option label.
- Each option description must say the effect or tradeoff, not repeat the
  label.
- Prefer short labels, but write enough text to make the choice unambiguous.
  If the tradeoff is long, put the extra detail in the option description.
- The client lets the user add a free-form note after choosing an option; use
  that note as extra context, not as a separate option.

Use choice labels that are actionable, such as `Keep current API
(Recommended)`, `Add migration`, or `Skip tests for now`. Avoid vague labels
such as `Yes`, `No`, or `Maybe` unless the question itself makes the action
unambiguous.

## Free-text questions

Use `free_text` when the answer is an identifier, URL, policy sentence,
business rule, naming choice, or other value that cannot be represented well as
a short option list.

Ask for the smallest useful input. Do not ask the user to write a long spec
when one missing value is enough.

## Image attachments

For non-secret questions, the client may return image attachments with the
answer. Use them when the user needs to show visual state, screenshots, design
references, error dialogs, or UI details that would be awkward to describe in
text.

If an answer contains attachments, inspect the attachment context as part of
the user's answer. Do not ask for the same screenshot again unless the
attachment is missing, unreadable, or contradicts the text answer.

## Secret questions

Use `secret` only for credentials, tokens, passwords, or similarly sensitive
values. Never echo the value back in a final answer or tool output summary.

If a non-secret alternative exists, prefer that alternative, such as asking the
user to configure an environment variable or choose an existing account.

## After the answer

Treat empty answers as cancellation or inability to answer. Continue only if a
safe default exists; otherwise explain the blocker briefly.

When an answer includes both a selected option and a `user_note: ...` entry,
honor the selected option first and use the note to refine the implementation.

After receiving the answer, proceed with the task. Do not ask the same question
again unless the workspace state changed or the previous answer is inconsistent
with later evidence.
