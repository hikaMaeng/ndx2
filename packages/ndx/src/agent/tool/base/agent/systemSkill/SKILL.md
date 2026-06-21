---
name: agent
description: Use the agent tool to delegate work to a discovered NDX subagent/subsession with its own session context, tools, model assignment, transcript, and interrupt lifecycle.
---

Use `agent` when a task should run as a nested session rather than as ordinary text in the current session.

Subagents are discovered from `.ndx` agent roots and are identified by `subagent_type`.

The selected `AGENT.md` owns the subagent prompt, model type, parent-context behavior, and queued follow-up messages. Do not invent or pass `prompt`, `description`, `modeltype`, or turn-limit arguments to the tool.

If the selected `AGENT.md` declares a `## arguments` JSON Schema block, pass a JSON object in `input` that satisfies that schema. If it does not declare arguments, call the tool with only `subagent_type`.

The tool result is the final assistant response from the child session plus metadata that links to the child transcript.
