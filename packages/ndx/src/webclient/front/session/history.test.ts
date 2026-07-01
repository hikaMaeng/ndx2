import assert from "node:assert/strict";
import test from "node:test";
import { NDX_SESSION_EVENT, NDX_TURN_EVENT } from "ndx/common/protocol";
import type { ChatMessage } from "./chat.js";
import { visibleUserRequestText } from "./chat.js";
import { chatMessageFromSessionEvent, chatMessagesFromHistorySummary, mergeRestoredChatMessages, mergeRestoredTurnFlows, mergeTurnSummary } from "./history.js";
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

test("history restore removes an optimistic pending user when the durable user row arrives", () => {
  const restored: ChatMessage[] = [
    { id: "input-1", role: "user", text: "수정을 이어서 진행해", attachments: [] },
    { id: "assistant-1", role: "assistant", text: "완료", attachments: [] }
  ];
  const live: ChatMessage[] = [
    { id: "pending-user:1", role: "user", text: "수정을 이어서 진행해", attachments: [] }
  ];

  assert.deepEqual(mergeRestoredChatMessages(live, restored), restored);
});

test("history chat projection ignores interrupt diagnostics", () => {
  assert.equal(chatMessageFromSessionEvent({
    type: NDX_SESSION_EVENT,
    sessionid: "session-1",
    event: NDX_TURN_EVENT.Interrupted,
    dataid: "interrupt-1",
    contents: { kind: "interrupt", requestedAt: "2026-06-03T14:50:45.679Z", interrupt: { accepted: false } } as Record<string, unknown>,
    createdat: "2026-06-03T14:50:45.699Z"
  }), undefined);
});

test("history chat projection displays a durable compact row as a branch summary message", () => {
  const message = chatMessageFromSessionEvent({
    type: NDX_SESSION_EVENT,
    sessionid: "session-1",
    event: NDX_TURN_EVENT.CompactCompleted,
    dataid: "1",
    contents: { kind: "compact", text: "분기 전 대화 요약", sourceRowCount: 4, createdReason: "branch" },
    createdat: "2026-06-02T00:00:00.000Z"
  });

  assert.deepEqual(message, {
    id: "1",
    role: "assistant",
    text: "분기 전 대화 요약",
    attachments: []
  });
});

test("history summary keeps a leading compact message before later turns", () => {
  const messages = chatMessagesFromHistorySummary([
    {
      type: NDX_SESSION_EVENT,
      sessionid: "session-1",
      event: NDX_TURN_EVENT.CompactCompleted,
      dataid: "1",
      contents: { kind: "compact", text: "분기 전 대화 요약", sourceRowCount: 4, createdReason: "branch" },
      createdat: "2026-06-02T00:00:00.000Z"
    },
    {
      type: NDX_SESSION_EVENT,
      sessionid: "session-1",
      event: NDX_TURN_EVENT.InputRecorded,
      dataid: "2",
      contents: { kind: "user_message", text: "다음 요청" },
      createdat: "2026-06-02T00:00:01.000Z"
    }
  ], [{
    inputDataId: "2",
    sessionid: "session-1",
    title: "다음 요청",
    status: "running",
    createdat: "2026-06-02T00:00:01.000Z",
    updatedat: "2026-06-02T00:00:01.000Z",
    iterations: []
  }]);

  assert.deepEqual(messages.map((item) => ({ id: item.id, role: item.role, text: item.text })), [
    { id: "1", role: "assistant", text: "분기 전 대화 요약" },
    { id: "2", role: "user", text: "다음 요청" }
  ]);
});

test("history summary renders branch source input before compact as a non-mutable user message", () => {
  const messages = chatMessagesFromHistorySummary([
    {
      type: NDX_SESSION_EVENT,
      sessionid: "session-1",
      event: NDX_TURN_EVENT.InputRecorded,
      dataid: "branch-source:1:42",
      contents: { kind: "user_message", text: "원본 사용자 요청" },
      createdat: "2026-06-02T00:00:00.000Z"
    },
    {
      type: NDX_SESSION_EVENT,
      sessionid: "session-1",
      event: NDX_TURN_EVENT.CompactCompleted,
      dataid: "1",
      contents: { kind: "compact", text: "분기 전 대화 요약", sourceRowCount: 4, createdReason: "branch" },
      createdat: "2026-06-02T00:00:00.000Z"
    },
    {
      type: NDX_SESSION_EVENT,
      sessionid: "session-1",
      event: NDX_TURN_EVENT.InputRecorded,
      dataid: "2",
      contents: { kind: "user_message", text: "분기 후 요청" },
      createdat: "2026-06-02T00:00:01.000Z"
    }
  ], [{
    inputDataId: "2",
    sessionid: "session-1",
    title: "분기 후 요청",
    status: "running",
    createdat: "2026-06-02T00:00:01.000Z",
    updatedat: "2026-06-02T00:00:01.000Z",
    iterations: []
  }]);

  assert.deepEqual(messages.map((item) => ({ id: item.id, role: item.role, text: item.text, historyActionsDisabled: item.historyActionsDisabled })), [
    { id: "branch-source:1:42", role: "user", text: "원본 사용자 요청", historyActionsDisabled: true },
    { id: "1", role: "assistant", text: "분기 전 대화 요약", historyActionsDisabled: undefined },
    { id: "2", role: "user", text: "분기 후 요청", historyActionsDisabled: undefined }
  ]);
});

test("history projection marks synthetic branch source input as non-mutable", () => {
  const message = chatMessageFromSessionEvent({
    type: NDX_SESSION_EVENT,
    sessionid: "session-1",
    event: NDX_TURN_EVENT.InputRecorded,
    dataid: "branch-source:1:42",
    contents: { kind: "user_message", text: "원본 사용자 요청" },
    createdat: "2026-06-02T00:00:00.000Z"
  });

  assert.equal(message?.role, "user");
  assert.equal(message?.historyActionsDisabled, true);
});

test("history summary restores a missing user row before the final assistant message", () => {
  const messages = chatMessagesFromHistorySummary([
    {
      type: NDX_SESSION_EVENT,
      sessionid: "session-1",
      event: NDX_TURN_EVENT.AssistantRecorded,
      dataid: "assistant-1",
      contents: { kind: "assistant_message", text: "배포 완료입니다." },
      createdat: "2026-06-02T00:00:02.000Z"
    }
  ], [{
    inputDataId: "input-1",
    sessionid: "session-1",
    title: "[[NDX_SKILL_web-deploy-docker]] apps/tetris\ntest1\n[[rewriter]]",
    status: "completed",
    createdat: "2026-06-02T00:00:00.000Z",
    updatedat: "2026-06-02T00:00:02.000Z",
    iterations: [{ iteration: 1, eventCount: 2, hasAssistantText: false, hasTools: true }]
  }]);

  assert.deepEqual(messages.map((message) => ({ id: message.id, role: message.role, text: message.text })), [
    { id: "input-1", role: "user", text: "$web-deploy-docker apps/tetris\ntest1" },
    { id: "assistant-1", role: "assistant", text: "배포 완료입니다." }
  ]);
});

test("visible user request text normalizes internal request markers for display", () => {
  assert.equal(
    visibleUserRequestText("[[NDX_THINKING_low]]\n[[NDX_SKILL_web-service-scaffold]] apps/demo\n[[rewriter]]"),
    "$web-service-scaffold apps/demo"
  );
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
