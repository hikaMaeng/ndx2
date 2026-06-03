import assert from "node:assert/strict";
import test from "node:test";
import { NDX_SESSION_EVENT, NDX_TURN_EVENT } from "../../../common/protocol/index.js";
import { sessionDataToSessionEvent, type NDXAgentWebSessionData } from "./index.js";

test("sessionDataToSessionEvent maps durable rows to socket event names", () => {
  const base = {
    dataid: "1",
    sessionid: "018f90d0-75cb-7d37-bfc9-6f9d0bb60cf5",
    createdat: "2026-05-18T00:00:00.000Z"
  };

  const rows: Array<[NDXAgentWebSessionData, string]> = [
    [{ ...base, type: "user", contents: { kind: "user_message", text: "hello" } }, NDX_TURN_EVENT.InputRecorded],
    [{ ...base, type: "assistant", contents: { kind: "assistant_message", text: "done" } }, NDX_TURN_EVENT.AssistantRecorded],
    [{ ...base, type: "assistant", contents: { kind: "error", message: "failed" } }, NDX_TURN_EVENT.AssistantRecorded],
    [{ ...base, type: "assistant", contents: { kind: "assistant_delta", iteration: 1, delta: "a", content: "a" } }, NDX_TURN_EVENT.AssistantDelta],
    [{ ...base, type: "assistant", contents: { kind: "assistant_reasoning", iteration: 1, summary: "thinking" } }, NDX_TURN_EVENT.AssistantReasoning],
    [{ ...base, type: "tool_call", contents: { kind: "tool_call", iteration: 1, toolCalls: [] } }, NDX_TURN_EVENT.ToolBatchStarted],
    [{ ...base, type: "assistant", contents: { kind: "tool_result", iteration: 1, results: [] } }, NDX_TURN_EVENT.ToolResultRecorded],
    [{ ...base, type: "assistant", contents: { kind: "cot_work", steps: [{ task: "Plan", status: "in_progress" }] } }, NDX_TURN_EVENT.CotWork],
    [{ ...base, type: "interrupt", contents: { kind: "interrupt", requestedAt: "2026-05-18T00:00:01.000Z" } }, NDX_TURN_EVENT.Interrupted],
    [{ ...base, type: "compact", contents: { kind: "compact", text: "summary", sourceRowCount: 2, createdReason: "limit" } }, NDX_TURN_EVENT.CompactCompleted]
  ];

  for (const [row, eventName] of rows) {
    const event = sessionDataToSessionEvent(row);
    assert.equal(event?.type, NDX_SESSION_EVENT);
    assert.equal(event?.event, eventName);
    assert.equal(event?.dataid, row.dataid);
    assert.equal(event?.contents, row.contents);
  }
});

test("sessionDataToSessionEvent ignores non-renderable rows", () => {
  assert.equal(
    sessionDataToSessionEvent({
      dataid: "1",
      sessionid: "018f90d0-75cb-7d37-bfc9-6f9d0bb60cf5",
      type: "debug",
      contents: { kind: "debug" },
      createdat: "2026-05-18T00:00:00.000Z"
    }),
    undefined
  );
});
