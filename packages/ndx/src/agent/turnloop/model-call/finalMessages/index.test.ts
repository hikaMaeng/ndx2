import assert from "node:assert/strict";
import test from "node:test";
import { NDX_TURN_EVENT } from "../../../../common/protocol/index.js";
import { createNDXHookRuntime } from "../../../hook/index.js";
import { runTurnModelRequestHook, systemHooks } from "../../../hook/turn.model.request/index.js";
import { buildFinalModelMessagesFromParts, buildFinalSessionMessages, runFinalMessagePolicyPipeline } from "./index.js";
import type { NDXDatabase, NDXSessionDataRow, NDXSessionRow } from "../../../session/types.js";

function row(dataid: string, type: string, contents: unknown): NDXSessionDataRow {
  return {
    dataid,
    sessionid: "018f0000-0000-7000-8000-000000000010",
    type,
    contents,
    createdat: new Date("2026-05-12T00:00:00.000Z")
  };
}

const database: NDXDatabase = {
  async query() {
    return { rows: [], rowCount: 0, command: "", oid: 0, fields: [] };
  },
  async close() {}
};

const session: NDXSessionRow = {
  sessionid: "018f0000-0000-7000-8000-000000000010",
  userid: "ndev",
  title: "title",
  lastupdated: new Date(0),
  mode: "none",
  path: "/workspace",
  projectname: "project-1",
  model: { type: "openai", model: "test-model", url: "http://model", token: "token", contextsize: 1000 },
  isrunning: true,
  turnphase: "model_request",
  interruptrequested: false,
  interruptrequestedat: null,
  interruptcompletedat: null
};

test("final message pipeline suppresses stale cot_work reminders before the latest user request", () => {
  const result = buildFinalSessionMessages([
    row("1", "user", { kind: "user_message", text: "작업해" }),
    row("2", "system", { kind: "cot_work_reminder", iteration: 2, sourceDataId: "1", text: "stale cot_work reminder" }),
    row("3", "user", { kind: "user_message", text: "이어서 해" }),
    row("4", "system", { kind: "cot_work_reminder", iteration: 2, sourceDataId: "3", text: "current cot_work reminder" })
  ]);

  assert.deepEqual(result.history, [
    { role: "user", content: "작업해" },
    { role: "user", content: "이어서 해" },
    { role: "user", content: "current cot_work reminder" }
  ]);
  assert.match(result.diagnostics.join("\n"), /stale cot_work_reminder suppress/);
});

test("final message pipeline suppresses runtime-control errors but keeps ordinary assistant errors", () => {
  const result = buildFinalSessionMessages([
    row("1", "user", { kind: "user_message", text: "작업해" }),
    row("2", "assistant", { kind: "error", message: "model response reasoning got stuck analyzing tool-call or transcript state before producing output." }),
    row("3", "assistant", { kind: "error", message: "Turn interrupted during model_request." }),
    row("4", "assistant", { kind: "error", message: "ordinary tool failure summary" })
  ]);

  assert.deepEqual(result.history, [
    { role: "user", content: "작업해" },
    { role: "assistant", content: "ordinary tool failure summary" }
  ]);
  assert.match(result.diagnostics.join("\n"), /runtime-control error suppress/);
});

test("final message pipeline suppresses stale invalid tool failure call and output pairs", () => {
  const result = buildFinalSessionMessages([
    row("1", "user", { kind: "user_message", text: "검증해" }),
    row("2", "tool_call", { kind: "tool_call", iteration: 1, toolCalls: [{ type: "function_call", call_id: "bad-call", name: "bash", arguments: "{\"command\":\"yarn\"}" }] }),
    row("3", "assistant", { kind: "tool_result", iteration: 1, results: [{ toolCallId: "bad-call", tool: "bash", success: false, output: "Bad control character in string literal in JSON at position 10" }] }),
    row("4", "tool_call", { kind: "tool_call", iteration: 1, toolCalls: [{ type: "function_call", call_id: "good-call", name: "read_file", arguments: "{\"path\":\"a.ts\"}" }] }),
    row("5", "assistant", { kind: "tool_result", iteration: 1, results: [{ toolCallId: "good-call", tool: "read_file", success: true, output: "file content" }] }),
    row("6", "user", { kind: "user_message", text: "이어서 해" })
  ]);

  assert.equal(result.history.some((message) => "call_id" in message && message.call_id === "bad-call"), false);
  assert.equal(result.history.some((message) => "call_id" in message && message.call_id === "good-call"), true);
  assert.deepEqual(result.history.at(-1), { role: "user", content: "이어서 해" });
  assert.match(result.diagnostics.join("\n"), /invalid tool failure pair suppress/);
});

test("final message policies use a standard ordered pipeline signature", () => {
  const calls: string[] = [];
  const context = runFinalMessagePolicyPipeline({
    rows: [row("1", "user", { kind: "user_message", text: "작업해" })],
    policies: [
      { name: "policy1", apply: (next) => ({ ...next, diagnostics: [...next.diagnostics, calls.push("policy1").toString()] }) },
      { name: "policy2", apply: (next) => ({ ...next, diagnostics: [...next.diagnostics, calls.push("policy2").toString()] }) }
    ]
  });

  assert.deepEqual(calls, ["policy1", "policy2"]);
  assert.deepEqual(context.diagnostics, ["1", "2"]);
});

test("prefix drift audit sees messages after final-message policies are applied", async () => {
  const base = {
    developer: { role: "system" as const, content: "developer instructions" },
    user: { role: "user" as const, content: "user instructions\n\n<environment_context>\n  <cwd>/workspace</cwd>\n</environment_context>" }
  };
  const firstSession = buildFinalSessionMessages([
    row("1", "user", { kind: "user_message", text: "작업해" }),
    row("2", "system", { kind: "cot_work_reminder", iteration: 2, sourceDataId: "1", text: "cot_work reminder" })
  ]);
  const secondSession = buildFinalSessionMessages([
    row("1", "user", { kind: "user_message", text: "작업해" }),
    row("2", "system", { kind: "cot_work_reminder", iteration: 2, sourceDataId: "1", text: "cot_work reminder" }),
    row("3", "user", { kind: "user_message", text: "다음 요청" })
  ]);
  const previous = buildFinalModelMessagesFromParts({ ...base, history: firstSession.history });
  const next = buildFinalModelMessagesFromParts({ ...base, history: secondSession.history });

  assert.deepEqual(previous.map((message) => "content" in message ? message.content : undefined), [
    "developer instructions",
    "user instructions\n\n<environment_context>\n  <cwd>/workspace</cwd>\n</environment_context>",
    "작업해",
    "cot_work reminder"
  ]);
  assert.deepEqual(next.map((message) => "content" in message ? message.content : undefined), [
    "developer instructions",
    "user instructions\n\n<environment_context>\n  <cwd>/workspace</cwd>\n</environment_context>",
    "작업해",
    "다음 요청"
  ]);

  const result = await runTurnModelRequestHook(createNDXHookRuntime({ [NDX_TURN_EVENT.ModelRequest]: systemHooks }, {}), {
    database,
    session,
    requestText: "다음 요청",
    userHome: "/home/ndx",
    projectHome: "/workspace",
    iteration: 1,
    previousModelRequestMessages: previous,
    messages: next
  });

  assert.deepEqual(result.result.effect.prefixDrifts?.map((drift) => ({
    message: drift.message,
    messageIndex: drift.messageIndex
  })), [{ message: "model request changed stable model-request prefix message 4.", messageIndex: 3 }]);
});
