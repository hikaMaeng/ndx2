import test from "node:test";
import assert from "node:assert/strict";
import { buildTurnMessagesFromParts } from "./index.js";
import type { ResponseInputItem } from "ndx/common/responseapi";

test("turn message assembly keeps prior request as the next request prefix for append-only history", () => {
  const first = buildTurnMessagesFromParts({
    developer: { role: "system", content: "developer instructions" },
    user: { role: "user", content: "user instructions\n\n<environment_context>\n  <cwd>/work</cwd>\n</environment_context>" },
    history: [
      { role: "user", content: "request 1" },
      { type: "function_call", name: "read_file", call_id: "call_1", arguments: "{\"path\":\"a.ts\"}" },
      { type: "function_call_output", call_id: "call_1", output: "file a" }
    ]
  });

  const second = buildTurnMessagesFromParts({
    developer: { role: "system", content: "developer instructions" },
    user: { role: "user", content: "user instructions\n\n<environment_context>\n  <cwd>/work</cwd>\n</environment_context>" },
    history: [
      { role: "user", content: "request 1" },
      { type: "function_call", name: "read_file", call_id: "call_1", arguments: "{\"path\":\"a.ts\"}" },
      { type: "function_call_output", call_id: "call_1", output: "file a" },
      { role: "user", content: "cot_work reminder" },
      { type: "function_call", name: "grep_search", call_id: "call_2", arguments: "{\"query\":\"x\"}" },
      { type: "function_call_output", call_id: "call_2", output: "grep result" }
    ]
  });

  assert.ok(serializeTextFallback(second).startsWith(`${serializeTextFallback(first)}\n\n`));
});

test("selected skill context remains an append-only prefix across tool continuation", () => {
  const selectedSkill = [
    "<selected_skill_instruction>",
    "The user explicitly selected `$cot-solve` for this request.",
    "The selected skill is model-visible before the first model iteration.",
    "You must apply this skill's workflow to the current request.",
    "Do not call `loadSkill` for this skill again unless the skill block is missing or unreadable.",
    "</selected_skill_instruction>",
    "",
    "<skill>",
    "<name>cot-solve</name>",
    "<path>/work/.ndx/system/skills/cot_solve/SKILL.md</path>",
    "Use cot solve.",
    "</skill>"
  ].join("\n");
  const first = buildTurnMessagesFromParts({
    developer: { role: "system", content: "developer instructions" },
    user: { role: "user", content: "user instructions\n\n<environment_context>\n  <cwd>/work</cwd>\n</environment_context>" },
    history: [
      { role: "user", content: selectedSkill },
      { role: "user", content: "$cot-solve fix this" }
    ]
  });
  const second = buildTurnMessagesFromParts({
    developer: { role: "system", content: "developer instructions" },
    user: { role: "user", content: "user instructions\n\n<environment_context>\n  <cwd>/work</cwd>\n</environment_context>" },
    history: [
      { role: "user", content: selectedSkill },
      { role: "user", content: "$cot-solve fix this" },
      { type: "function_call", name: "read_file", call_id: "call_1", arguments: "{\"path\":\"a.ts\"}" },
      { type: "function_call_output", call_id: "call_1", output: "file a" }
    ]
  });

  assert.ok(serializeTextFallback(second).startsWith(`${serializeTextFallback(first)}\n\n`));
});

function serializeTextFallback(messages: ResponseInputItem[]): string {
  return messages.map((message) => {
    if ("role" in message) {
      return `${message.role}:\n${typeof message.content === "string" ? message.content : JSON.stringify(message.content)}`;
    }
    if (message.type === "function_call") {
      return `assistant function_call ${typeof message.name === "string" ? message.name : "unknown"} (${typeof message.call_id === "string" ? message.call_id : "tool_call"}):\n${typeof message.arguments === "string" ? message.arguments : JSON.stringify(message.arguments ?? {})}`;
    }
    if (message.type === "function_call_output") {
      return `tool result (${typeof message.call_id === "string" ? message.call_id : "tool_call"}):\n${typeof message.output === "string" ? message.output : JSON.stringify(message.output ?? "")}`;
    }
    return `${typeof message.type === "string" ? message.type : "input_item"}:\n${JSON.stringify(message)}`;
  }).join("\n\n");
}
