import assert from "node:assert/strict";
import test from "node:test";
import {
  NDX_SESSION_EVENT,
  NDX_TURN_EVENT,
  type NDXSessionEventMessage
} from "ndx/common/protocol";
import { applyProtocolEventToSessionUiState, PROTOCOL_EVENT_UI_REDUCERS, type ProtocolEventUiText } from "./protocolEventReducer.js";
import { createSessionUiState } from "./uiState.js";

const text: ProtocolEventUiText = {
  compactCompleted: "compact completed",
  compactStarted: "compact started",
  interruptPending: "interrupt pending",
  interruptStored: "interrupt stored",
  operationInProgress: "operation in progress",
  prefixDrift: "prefix drift",
  requestStored: "request stored"
};

test("webclient protocol event reducers cover every turn event from common protocol", () => {
  assert.deepEqual(
    Object.values(NDX_TURN_EVENT).filter((event) => !(event in PROTOCOL_EVENT_UI_REDUCERS)),
    []
  );
});

test("rejected interrupt clears stale interrupt pending notice", () => {
  const current = {
    ...createSessionUiState(),
    agentRunning: true,
    notice: "interrupt pending",
    turnFlows: [{
      id: "turn:session-1:input-1",
      inputDataId: "input-1",
      sessionid: "session-1",
      title: "done",
      status: "completed" as const,
      collapsed: true,
      createdAt: "2026-06-03T14:50:40.000Z",
      updatedAt: "2026-06-03T14:50:44.000Z",
      batches: []
    }]
  };
  const message: NDXSessionEventMessage = {
    type: NDX_SESSION_EVENT,
    sessionid: "session-1",
    event: NDX_TURN_EVENT.Interrupted,
    dataid: "interrupt-1",
    contents: { kind: "interrupt", requestedAt: "2026-06-03T14:50:45.679Z", interrupt: { accepted: false } } as Record<string, unknown>,
    createdat: "2026-06-03T14:50:45.699Z"
  };

  const next = applyProtocolEventToSessionUiState(current, message, text);

  assert.equal(next.agentRunning, false);
  assert.equal(next.notice, "interrupt stored");
  assert.deepEqual(next.chatMessages, []);
  assert.equal(next.turnFlows.length, 1);
  assert.equal(next.turnFlows[0]?.status, "completed");
});

test("input recorded replaces a pending user request message", () => {
  const current = {
    ...createSessionUiState(),
    agentRunning: true,
    chatMessages: [
      { id: "pending-user:1", role: "user" as const, text: "원본 요청", attachments: [] }
    ]
  };
  const message: NDXSessionEventMessage = {
    type: NDX_SESSION_EVENT,
    sessionid: "session-1",
    event: NDX_TURN_EVENT.InputRecorded,
    dataid: "input-1",
    contents: { kind: "user_message", text: "변환된 요청" },
    createdat: "2026-06-03T14:50:45.699Z"
  };

  const next = applyProtocolEventToSessionUiState(current, message, text);

  assert.deepEqual(next.chatMessages.map((item) => ({ id: item.id, role: item.role, text: item.text })), [
    { id: "input-1", role: "user", text: "변환된 요청" }
  ]);
  assert.equal(next.agentRunning, true);
  assert.equal(next.turnFlows[0]?.inputDataId, "input-1");
});

test("turn end clears runtime state without creating a new turn card", () => {
  const current = {
    ...createSessionUiState(),
    agentRunning: true,
    compactRunning: true,
    chatMessages: [
      { id: "pending-user:1", role: "user" as const, text: "다음 요청", attachments: [] }
    ],
    turnFlows: [{
      id: "turn:session-1:input-1",
      inputDataId: "input-1",
      sessionid: "session-1",
      title: "done",
      status: "completed" as const,
      collapsed: true,
      createdAt: "2026-06-03T14:50:40.000Z",
      updatedAt: "2026-06-03T14:50:44.000Z",
      batches: []
    }]
  };
  const message: NDXSessionEventMessage = {
    type: NDX_SESSION_EVENT,
    sessionid: "session-1",
    event: NDX_TURN_EVENT.TurnEnd,
    dataid: "turn-end:session-1:1",
    contents: { kind: "turn_end", iteration: 1 },
    createdat: "2026-06-03T14:50:45.699Z"
  };

  const next = applyProtocolEventToSessionUiState(current, message, text);

  assert.equal(next.agentRunning, false);
  assert.equal(next.compactRunning, false);
  assert.deepEqual(next.chatMessages, []);
  assert.equal(next.turnFlows.length, 1);
  assert.equal(next.turnFlows[0]?.id, "turn:session-1:input-1");
  assert.equal(next.turnFlows[0]?.status, "completed");
});

test("assistant recorded clears stale optimistic user request message", () => {
  const current = {
    ...createSessionUiState(),
    agentRunning: true,
    chatMessages: [
      { id: "input-1", role: "user" as const, text: "요청", attachments: [] },
      { id: "pending-user:1", role: "user" as const, text: "요청 처리 중", attachments: [] }
    ]
  };
  const message: NDXSessionEventMessage = {
    type: NDX_SESSION_EVENT,
    sessionid: "session-1",
    event: NDX_TURN_EVENT.AssistantRecorded,
    dataid: "assistant-1",
    contents: { kind: "assistant_message", text: "완료" },
    createdat: "2026-06-03T14:50:45.699Z"
  };

  const next = applyProtocolEventToSessionUiState(current, message, text);

  assert.equal(next.agentRunning, false);
  assert.deepEqual(next.chatMessages.map((item) => ({ id: item.id, role: item.role, text: item.text })), [
    { id: "input-1", role: "user", text: "요청" },
    { id: "assistant-1", role: "assistant", text: "완료" }
  ]);
});

test("assistant deltas update the running turn without creating a standalone assistant bubble", () => {
  const current = applyProtocolEventToSessionUiState({
    ...createSessionUiState(),
    chatMessages: [
      { id: "pending-user:1", role: "user" as const, text: "요청", attachments: [] }
    ]
  }, {
    type: NDX_SESSION_EVENT,
    sessionid: "session-1",
    event: NDX_TURN_EVENT.InputRecorded,
    dataid: "input-1",
    contents: { kind: "user_message", text: "요청" },
    createdat: "2026-06-03T14:50:45.699Z"
  }, text);
  const message: NDXSessionEventMessage = {
    type: NDX_SESSION_EVENT,
    sessionid: "session-1",
    event: NDX_TURN_EVENT.AssistantDelta,
    dataid: "stream:session-1:1",
    contents: { kind: "assistant_delta", iteration: 1, delta: "작성 중", content: "작성 중" },
    createdat: "2026-06-03T14:50:46.699Z"
  };

  const next = applyProtocolEventToSessionUiState(current, message, text);

  assert.deepEqual(next.chatMessages.map((item) => ({ id: item.id, role: item.role, text: item.text })), [
    { id: "input-1", role: "user", text: "요청" }
  ]);
  assert.equal(next.turnFlows[0]?.batches[0]?.assistantText, "작성 중");
  assert.equal(next.agentRunning, true);
});

test("hook diagnostics do not resurrect a completed turn as running", () => {
  const current = {
    ...createSessionUiState(),
    agentRunning: false,
    notice: "request stored",
    turnFlows: [{
      id: "turn:session-1:input-1",
      inputDataId: "input-1",
      sessionid: "session-1",
      title: "done",
      status: "completed" as const,
      collapsed: true,
      createdAt: "2026-06-03T14:50:40.000Z",
      updatedAt: "2026-06-03T14:50:44.000Z",
      batches: []
    }]
  };
  const message: NDXSessionEventMessage = {
    type: NDX_SESSION_EVENT,
    sessionid: "session-1",
    event: NDX_TURN_EVENT.HookComplete,
    dataid: "hook:session-1:turn.end",
    contents: { event: "turn.end", count: 1 },
    createdat: "2026-06-03T14:50:45.699Z"
  };

  const next = applyProtocolEventToSessionUiState(current, message, text);

  assert.equal(next.agentRunning, false);
  assert.equal(next.notice, "request stored");
  assert.equal(next.turnFlows[0]?.status, "completed");
});

test("server session state overrides display event running projection", () => {
  const current = {
    ...createSessionUiState(),
    agentRunning: false,
    notice: "request stored",
    turnFlows: [{
      id: "turn:session-1:input-1",
      inputDataId: "input-1",
      sessionid: "session-1",
      title: "done",
      status: "completed" as const,
      collapsed: true,
      createdAt: "2026-06-03T14:50:40.000Z",
      updatedAt: "2026-06-03T14:50:44.000Z",
      batches: []
    }]
  };
  const message: NDXSessionEventMessage = {
    type: NDX_SESSION_EVENT,
    sessionid: "session-1",
    event: NDX_TURN_EVENT.CotWork,
    dataid: "cot-work:session-1:1:cot_work:2",
    contents: {
      kind: "cot_work",
      steps: [
        { task: "Inspect", status: "completed", elapsedMs: 1_000 },
        { task: "Deploy", status: "completed", elapsedMs: 2_000 }
      ],
      totalElapsed: "00:03"
    },
    createdat: "2026-06-03T14:50:45.699Z",
    sessionState: { isrunning: false }
  };

  const next = applyProtocolEventToSessionUiState(current, message, text);

  assert.equal(next.agentRunning, false);
  assert.equal(next.cotWork, message.contents);
  assert.equal(next.notice, "operation in progress");
  assert.deepEqual(next.rightSidebarItems.map((item) => item.title), ["Inspect", "Deploy"]);
});

test("cot work events project completed steps into right sidebar items", () => {
  const current = {
    ...createSessionUiState(),
    rightSidebarItems: [{
      group: { id: "plans", title: "작업 계획" },
      key: "cot-work:old-call",
      title: "작업 계획 기록",
      body: "3개 단계",
      kind: "cot_work"
    }, {
      group: { id: "plans", title: "작업 계획" },
      key: "cot-work-step:9:stale",
      title: "Stale completed step",
      body: "99:99",
      kind: "cot_work"
    }, {
      group: { id: "skills", title: "스킬" },
      key: "skill:demo",
      title: "demo",
      kind: "skill"
    }]
  };
  const message: NDXSessionEventMessage = {
    type: NDX_SESSION_EVENT,
    sessionid: "session-1",
    event: NDX_TURN_EVENT.CotWork,
    dataid: "cot-work:session-1:1:cot_work:1",
    contents: {
      kind: "cot_work",
      steps: [
        { task: "Inspect current frontend game state and control flow to confirm required UI changes", status: "completed", elapsed: "55:09", elapsedMs: 3_309_000 },
        { task: "Update GameControls button visibility, disable reset before start, and remove B-key reset hint while preserving non-blocking game-over notice behavior", status: "completed", elapsedMs: 1_200_000 },
        { task: "Verify updated UI behavior by reviewing changed files and running relevant frontend checks/tests if available", status: "in_progress" }
      ],
      totalElapsed: "75:09"
    },
    createdat: "2026-06-03T14:50:45.699Z"
  };

  const next = applyProtocolEventToSessionUiState(current, message, text);

  assert.deepEqual(next.rightSidebarItems.map((item) => ({ title: item.title, body: item.body, kind: item.kind })), [
    { title: "demo", body: undefined, kind: "skill" },
    { title: "Inspect current frontend game state and control flow to confirm required UI changes", body: "55:09", kind: "cot_work" },
    { title: "Update GameControls button visibility, disable reset before start, and remove B-key reset hint while preserving non-blocking game-over notice behavior", body: "20:00", kind: "cot_work" }
  ]);
});
