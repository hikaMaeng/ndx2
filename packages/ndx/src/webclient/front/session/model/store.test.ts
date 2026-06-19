import assert from "node:assert/strict";
import test from "node:test";
import {
  NDX_SESSION_CREATED,
  NDX_SESSION_EVENT,
  NDX_SESSION_HISTORY_SUMMARY_RESULT,
  NDX_SESSION_SIDEBAR_ITEM,
  NDX_TURN_EVENT,
  type NDXSessionCreatedMessage,
  type NDXSessionEventMessage,
  type NDXSessionHistorySummaryResultMessage,
  type NDXSessionSidebarItemMessage
} from "ndx/common/protocol";
import type { NDXAgentWebSession } from "ndx/webclient/common";
import {
  applyRoutedSessionMessageToStore,
  createDraftSessionModel,
  createSessionModelFromRow,
  promoteDraftModelInStore,
  type SessionModelSnapshot
} from "./index.js";

const text = {
  compactCompleted: "compact completed",
  compactStarted: "compact started",
  interruptPending: "interrupt pending",
  interruptStored: "interrupt stored",
  operationInProgress: "running",
  prefixDrift: "prefix drift",
  requestStored: "stored"
};

test("routed messages update the addressed inactive session model only", () => {
  const snapshot: SessionModelSnapshot = {
    "session-a": createSessionModelFromRow(sessionRow("session-a", "project-a")),
    "session-b": createSessionModelFromRow(sessionRow("session-b", "project-a"))
  };

  const next = applyRoutedSessionMessageToStore(snapshot, inputRecorded("session-b", "input-b", "비활성 세션 요청"), text);

  assert.equal(next["session-a"]?.history.messages.length, 0);
  assert.equal(next["session-b"]?.history.messages.length, 1);
  assert.equal(next["session-b"]?.history.messages[0]?.text, "비활성 세션 요청");
});

test("routed messages for unknown session models are ignored", () => {
  const snapshot: SessionModelSnapshot = {
    "session-a": createSessionModelFromRow(sessionRow("session-a", "project-a"))
  };

  const next = applyRoutedSessionMessageToStore(snapshot, inputRecorded("session-missing", "input-missing", "무시"), text);

  assert.equal(next, snapshot);
  assert.equal(next["session-a"]?.history.messages.length, 0);
});

test("history summary restores visible request and completed turn into the model", () => {
  const snapshot: SessionModelSnapshot = {
    "session-a": createSessionModelFromRow(sessionRow("session-a", "project-a"))
  };
  const message: NDXSessionHistorySummaryResultMessage = {
    type: NDX_SESSION_HISTORY_SUMMARY_RESULT,
    sessionid: "session-a",
    visibleEvents: [inputRecorded("session-a", "input-a", "복원 요청")],
    turns: [{
      inputDataId: "input-a",
      sessionid: "session-a",
      title: "복원 요청",
      status: "completed",
      createdat: "2026-06-04T00:00:00.000Z",
      updatedat: "2026-06-04T00:00:01.000Z",
      iterations: [{ iteration: 1, eventCount: 3, hasAssistantText: true, hasTools: false }]
    }]
  };

  const next = applyRoutedSessionMessageToStore(snapshot, message, text);

  assert.equal(next["session-a"]?.connection.historyLoaded, true);
  assert.equal(next["session-a"]?.history.messages[0]?.id, "input-a");
  assert.equal(next["session-a"]?.history.turns[0]?.status, "completed");
  assert.equal(next["session-a"]?.history.turns[0]?.batches[0]?.collapsed, true);
});

test("history summary synthesizes a missing visible request from the turn summary", () => {
  const snapshot: SessionModelSnapshot = {
    "session-a": createSessionModelFromRow(sessionRow("session-a", "project-a"))
  };
  const message: NDXSessionHistorySummaryResultMessage = {
    type: NDX_SESSION_HISTORY_SUMMARY_RESULT,
    sessionid: "session-a",
    visibleEvents: [{
      type: NDX_SESSION_EVENT,
      sessionid: "session-a",
      event: NDX_TURN_EVENT.AssistantRecorded,
      dataid: "assistant-a",
      contents: { kind: "assistant_message", text: "완료" },
      createdat: "2026-06-04T00:00:02.000Z"
    }],
    turns: [{
      inputDataId: "input-a",
      sessionid: "session-a",
      title: "복원 요청",
      status: "completed",
      createdat: "2026-06-04T00:00:00.000Z",
      updatedat: "2026-06-04T00:00:02.000Z",
      iterations: [{ iteration: 1, eventCount: 3, hasAssistantText: true, hasTools: false }]
    }]
  };

  const next = applyRoutedSessionMessageToStore(snapshot, message, text);

  assert.deepEqual(next["session-a"]?.history.messages.map((item) => ({ id: item.id, role: item.role, text: item.text })), [
    { id: "input-a", role: "user", text: "복원 요청" },
    { id: "assistant-a", role: "assistant", text: "완료" }
  ]);
  assert.equal(next["session-a"]?.history.turns[0]?.inputDataId, "input-a");
});

test("history summary restores active cot work into the session model", () => {
  const snapshot: SessionModelSnapshot = {
    "session-a": createSessionModelFromRow(sessionRow("session-a", "project-a"))
  };
  const activeCotWork = {
    kind: "cot_work" as const,
    steps: [
      { task: "조사", status: "completed" as const, elapsedMs: 1000 },
      { task: "수정", status: "in_progress" as const, elapsedMs: 2000 },
      { task: "검증", status: "pending" as const }
    ],
    totalElapsedMs: 3000,
    timingUpdatedAt: "2026-06-04T00:00:02.000Z"
  };
  const message: NDXSessionHistorySummaryResultMessage = {
    type: NDX_SESSION_HISTORY_SUMMARY_RESULT,
    sessionid: "session-a",
    visibleEvents: [inputRecorded("session-a", "input-a", "긴 작업")],
    turns: [{
      inputDataId: "input-a",
      sessionid: "session-a",
      title: "긴 작업",
      status: "running",
      createdat: "2026-06-04T00:00:00.000Z",
      updatedat: "2026-06-04T00:00:02.000Z",
      iterations: []
    }],
    activeCotWork
  };

  const next = applyRoutedSessionMessageToStore(snapshot, message, text);

  assert.deepEqual(next["session-a"]?.runtime.cotWork, activeCotWork);
});

test("sidebar item messages are scoped to one session model", () => {
  const sessionA = createSessionModelFromRow(sessionRow("session-a", "project-a"));
  const sessionB = createSessionModelFromRow(sessionRow("session-b", "project-a"));
  const snapshot: SessionModelSnapshot = {
    "session-a": sessionA,
    "session-b": sessionB
  };
  const message: NDXSessionSidebarItemMessage = {
    type: NDX_SESSION_SIDEBAR_ITEM,
    sessionid: "session-b",
    tool: "edit",
    createdat: "2026-06-04T00:00:00.000Z",
    item: {
      group: { id: "changed-files", title: "변경 파일" },
      key: "file:a.ts",
      title: "a.ts"
    }
  };

  const next = applyRoutedSessionMessageToStore(snapshot, message, text);

  assert.equal(next["session-a"]?.sidebar.items.length, 0);
  assert.equal(next["session-b"]?.sidebar.items.length, 1);
});

test("draft promotion preserves existing model substate under the created session id", () => {
  const draft = {
    ...createDraftSessionModel("project-a"),
    sidebar: {
      open: true,
      width: 360,
      scrollTop: 40,
      items: []
    },
    composer: {
      ...createDraftSessionModel("project-a").composer,
      input: "작성 중"
    }
  };
  const snapshot: SessionModelSnapshot = {
    [draft.key]: draft
  };
  const created: NDXSessionCreatedMessage = {
    type: NDX_SESSION_CREATED,
    sessionid: "session-a",
    userid: "ndev",
    title: "새 요청",
    lastupdated: "2026-06-04T00:00:00.000Z",
    mode: "none",
    projectname: "project-a",
    path: "/ndx/workspace/project-a",
    model: {
      type: "openai",
      model: "gpt-5",
      url: "http://localhost",
      token: "",
      contextsize: 128000
    },
    isrunning: true,
    initialInputAccepted: true
  };

  const next = promoteDraftModelInStore(snapshot, draft.key, created);

  assert.equal(next[draft.key], undefined);
  assert.equal(next["session-a"]?.composer.input, "작성 중");
  assert.equal(next["session-a"]?.sidebar.open, true);
  assert.equal(next["session-a"]?.runtime.agentRunning, true);
});

function sessionRow(sessionid: string, projectname: string): NDXAgentWebSession {
  return {
    sessionid,
    userid: "ndev",
    title: sessionid,
    lastupdated: "2026-06-04T00:00:00.000Z",
    mode: "none",
    projectname,
    path: `/ndx/workspace/${projectname}`,
    model: {
      type: "openai",
      model: "gpt-5",
      url: "http://localhost",
      token: "",
      contextsize: 128000
    },
    isrunning: false
  };
}

function inputRecorded(sessionid: string, dataid: string, text: string): NDXSessionEventMessage {
  return {
    type: NDX_SESSION_EVENT,
    sessionid,
    event: NDX_TURN_EVENT.InputRecorded,
    dataid,
    contents: { kind: "user_message", text },
    createdat: "2026-06-04T00:00:00.000Z"
  };
}
