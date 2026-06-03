import assert from "node:assert/strict";
import test from "node:test";
import type { ChatMessage } from "./chat.js";
import { mergeRestoredChatMessages, mergeRestoredTurnFlows, mergeTurnSummary } from "./history.js";
import type { TurnFlowState } from "./turn/index.js";

test("history restore does not erase live chat messages when a stale empty summary arrives", () => {
  const live: ChatMessage[] = [
    { id: "input-1", role: "user", text: "첫 요청", attachments: [] }
  ];

  assert.deepEqual(mergeRestoredChatMessages(live, []), live);
});

test("history restore deduplicates durable messages and keeps live stream messages", () => {
  const restored: ChatMessage[] = [
    { id: "input-1", role: "user", text: "첫 요청", attachments: [] }
  ];
  const live: ChatMessage[] = [
    { id: "input-1", role: "user", text: "첫 요청", attachments: [] },
    { id: "stream:session-1", role: "assistant", text: "작성 중", attachments: [] }
  ];

  assert.deepEqual(mergeRestoredChatMessages(live, restored), [
    restored[0],
    live[1]
  ]);
});

test("history restore does not erase live turn flow when a stale empty summary arrives", () => {
  const live = [turn("input-1", "running", "2026-06-02T00:00:01.000Z")];

  assert.deepEqual(mergeRestoredTurnFlows(live, []), live);
});

test("history restore updates duplicate turn status without dropping live iteration detail", () => {
  const live = [turn("input-1", "running", "2026-06-02T00:00:01.000Z")];
  const restored = mergeRestoredTurnFlows(live, [{
    inputDataId: "input-1",
    sessionid: "session-1",
    title: "첫 요청",
    status: "completed",
    createdat: "2026-06-02T00:00:00.000Z",
    updatedat: "2026-06-02T00:00:02.000Z",
    iterations: []
  }]);

  assert.equal(restored.length, 1);
  assert.equal(restored[0]?.status, "completed");
  assert.equal(restored[0]?.batches[0]?.assistantText, "작성 중");
});

test("history restore does not downgrade a terminal live turn to running", () => {
  const live = [turn("input-1", "completed", "2026-06-02T00:00:02.000Z")];
  const restored = mergeRestoredTurnFlows(live, [{
    inputDataId: "input-1",
    sessionid: "session-1",
    title: "첫 요청",
    status: "running",
    createdat: "2026-06-02T00:00:00.000Z",
    updatedat: "2026-06-02T00:00:02.000Z",
    iterations: [{ iteration: 1, eventCount: 2, hasAssistantText: true, hasTools: false }]
  }]);

  assert.equal(restored[0]?.status, "completed");
});

test("turn detail does not downgrade a terminal live turn to running", () => {
  const live = [turn("input-1", "completed", "2026-06-02T00:00:02.000Z")];
  const merged = mergeTurnSummary(live, {
    inputDataId: "input-1",
    sessionid: "session-1",
    title: "첫 요청",
    status: "running",
    createdat: "2026-06-02T00:00:00.000Z",
    updatedat: "2026-06-02T00:00:01.000Z",
    iterations: [{ iteration: 1, eventCount: 2, hasAssistantText: true, hasTools: false }]
  });

  assert.equal(merged[0]?.status, "completed");
  assert.equal(merged[0]?.batches[0]?.iteration, 1);
});

function turn(inputDataId: string, status: TurnFlowState["status"], updatedAt: string): TurnFlowState {
  return {
    id: `turn:session-1:${inputDataId}`,
    inputDataId,
    sessionid: "session-1",
    title: "첫 요청",
    status,
    collapsed: false,
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt,
    batches: [{
      key: `turn:session-1:${inputDataId}:iteration:1`,
      iteration: 1,
      collapsed: false,
      assistantText: "작성 중",
      reasoningText: "",
      modelEvents: [],
      tools: []
    }]
  };
}
