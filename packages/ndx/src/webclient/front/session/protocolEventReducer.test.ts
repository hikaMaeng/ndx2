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

test("turn end clears runtime state without creating a new turn card", () => {
  const current = {
    ...createSessionUiState(),
    agentRunning: true,
    compactRunning: true,
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
  assert.equal(next.turnFlows.length, 1);
  assert.equal(next.turnFlows[0]?.id, "turn:session-1:input-1");
  assert.equal(next.turnFlows[0]?.status, "completed");
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
