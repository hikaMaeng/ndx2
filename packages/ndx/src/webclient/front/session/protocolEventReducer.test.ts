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
    notice: "interrupt pending"
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
  assert.equal(next.chatMessages.at(-1)?.role, "system");
});
