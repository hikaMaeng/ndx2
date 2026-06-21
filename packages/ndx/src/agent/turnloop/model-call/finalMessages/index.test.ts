import assert from "node:assert/strict";
import test from "node:test";
import { NDX_TURN_EVENT } from "../../../../common/protocol/index.js";
import { snapshotModelRequestStablePrefix } from "../../../hook/base/prefixDrift/index.js";
import { createNDXHookRuntime } from "../../../hook/index.js";
import { runTurnModelRequestHook, systemHooks } from "../../../hook/turn.model.request/index.js";
import { prepareFinalModelRequestMessagesForCall } from "./index.js";
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
  parentsessionid: "018f0000-0000-7000-8000-000000000010",
  rootsessionid: "018f0000-0000-7000-8000-000000000010",
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

function historyMessages(rows: NDXSessionDataRow[]) {
  return prepareFinalModelRequestMessagesForCall({
    parts: {
      developer: { role: "system", content: "" },
      user: { role: "user", content: "" },
      historyRows: rows
    },
    omitBaseMessages: true
  });
}

function fullMessages(historyRows: NDXSessionDataRow[]) {
  return prepareFinalModelRequestMessagesForCall({
    parts: {
      developer: { role: "system", content: "developer instructions" },
      user: { role: "user", content: "user instructions\n\n<environment_context>\n  <cwd>/workspace</cwd>\n</environment_context>" },
      historyRows
    }
  });
}

test("final message pipeline suppresses stale cot_work reminders before the latest user request", () => {
  const result = historyMessages([
    row("1", "user", { kind: "user_message", text: "작업해" }),
    row("2", "system", { kind: "cot_work_reminder", iteration: 2, sourceDataId: "1", text: "stale cot_work reminder" }),
    row("3", "user", { kind: "user_message", text: "이어서 해" }),
    row("4", "system", { kind: "cot_work_reminder", iteration: 2, sourceDataId: "3", text: "current cot_work reminder" })
  ]);

  assert.deepEqual(result, [
    { role: "user", content: "작업해" },
    { role: "user", content: "이어서 해" },
    { role: "user", content: "current cot_work reminder" }
  ]);
});

test("final message pipeline suppresses runtime-control errors but keeps ordinary assistant errors", () => {
  const result = historyMessages([
    row("1", "user", { kind: "user_message", text: "작업해" }),
    row("2", "assistant", { kind: "error", message: "model response reasoning got stuck analyzing tool-call or transcript state before producing output." }),
    row("3", "assistant", { kind: "error", message: "Turn interrupted during model_request." }),
    row("4", "assistant", { kind: "error", message: "ordinary tool failure summary" })
  ]);

  assert.deepEqual(result, [
    { role: "user", content: "작업해" },
    { role: "assistant", content: "ordinary tool failure summary" }
  ]);
});

test("final message pipeline suppresses stale invalid tool failure call and output pairs", () => {
  const result = historyMessages([
    row("1", "user", { kind: "user_message", text: "검증해" }),
    row("2", "tool_call", { kind: "tool_call", iteration: 1, toolCalls: [{ type: "function_call", call_id: "bad-call", name: "bash", arguments: "{\"command\":\"yarn\"}" }] }),
    row("3", "assistant", { kind: "tool_result", iteration: 1, results: [{ toolCallId: "bad-call", tool: "bash", success: false, output: "Bad control character in string literal in JSON at position 10" }] }),
    row("4", "tool_call", { kind: "tool_call", iteration: 1, toolCalls: [{ type: "function_call", call_id: "good-call", name: "read_file", arguments: "{\"path\":\"a.ts\"}" }] }),
    row("5", "assistant", { kind: "tool_result", iteration: 1, results: [{ toolCallId: "good-call", tool: "read_file", success: true, output: "file content" }] }),
    row("6", "user", { kind: "user_message", text: "이어서 해" })
  ]);

  assert.equal(result.some((message) => "call_id" in message && message.call_id === "bad-call"), false);
  assert.equal(result.some((message) => "call_id" in message && message.call_id === "good-call"), true);
  assert.deepEqual(result.at(-1), { role: "user", content: "이어서 해" });
});

test("final message pipeline expands compact replay rows as direct prior-turn history", () => {
  const result = historyMessages([
    row("10", "compact", { kind: "compact", text: "older summary", sourceRowCount: 2, createdReason: "context_limit" }),
    row("11", "system", {
      kind: "compact_replay",
      sourceStartDataId: "7",
      sourceEndDataId: "9",
      sourceRowCount: 3,
      rows: [
        { dataid: "7", type: "user", contents: { kind: "user_message", text: "직전 요청" }, createdat: "2026-05-12T00:00:00.000Z" },
        { dataid: "8", type: "tool_call", contents: { kind: "tool_call", iteration: 1, toolCalls: [{ type: "function_call", call_id: "call-1", name: "read_file", arguments: "{\"path\":\"a.ts\"}" }] }, createdat: "2026-05-12T00:00:01.000Z" },
        { dataid: "9", type: "assistant", contents: { kind: "tool_result", iteration: 1, results: [{ toolCallId: "call-1", tool: "read_file", success: true, output: "file content" }] }, createdat: "2026-05-12T00:00:02.000Z" }
      ]
    }),
    row("12", "user", { kind: "user_message", text: "계속 진행" })
  ]);

  assert.deepEqual(result, [
    { role: "user", content: "Session compact summary:\nolder summary" },
    { role: "user", content: "직전 요청" },
    { type: "function_call", call_id: "call-1", name: "read_file", arguments: "{\"path\":\"a.ts\"}" },
    { type: "function_call_output", call_id: "call-1", output: "file content" },
    { role: "user", content: "계속 진행" }
  ]);
});

test("prefix drift audit sees messages after final-message policies are applied", async () => {
  const previous = fullMessages([
    row("1", "user", { kind: "user_message", text: "작업해" }),
    row("2", "system", { kind: "cot_work_reminder", iteration: 2, sourceDataId: "1", text: "cot_work reminder" })
  ]);
  const next = fullMessages([
    row("1", "user", { kind: "user_message", text: "작업해" }),
    row("2", "system", { kind: "cot_work_reminder", iteration: 2, sourceDataId: "1", text: "cot_work reminder" }),
    row("3", "user", { kind: "user_message", text: "다음 요청" })
  ]);

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
    previousModelRequestStablePrefix: snapshotModelRequestStablePrefix(previous),
    messages: next
  });

  assert.deepEqual(result.result.effect.prefixDrifts?.map((drift) => ({
    message: drift.message,
    messageIndex: drift.messageIndex
  })), [{ message: "model request changed stable model-request prefix message 4.", messageIndex: 3 }]);
});
