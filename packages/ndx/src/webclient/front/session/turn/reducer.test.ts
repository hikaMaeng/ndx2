import assert from "node:assert/strict";
import test from "node:test";
import { NDX_TURN_EVENT, type NDXSessionEventMessage, type NDXSessionIterationSummary, type NDXSessionTurnSummary } from "ndx/common/protocol";
import { applyTurnEvent } from "./reducer.js";
import type { TurnBatchState, TurnFlowState } from "./types.js";

type TypeEquals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;

const turnProtocolProjectionTypeCheck: {
  inputDataId: TypeEquals<TurnFlowState["inputDataId"], NDXSessionTurnSummary["inputDataId"]>;
  iteration: TypeEquals<TurnBatchState["iteration"], NDXSessionIterationSummary["iteration"]>;
  sessionid: TypeEquals<TurnFlowState["sessionid"], NDXSessionTurnSummary["sessionid"]>;
  status: TypeEquals<TurnFlowState["status"], NDXSessionTurnSummary["status"]>;
  title: TypeEquals<TurnFlowState["title"], NDXSessionTurnSummary["title"]>;
} = {
  inputDataId: true,
  iteration: true,
  sessionid: true,
  status: true,
  title: true
};

void turnProtocolProjectionTypeCheck;

test("turn reducer only auto-collapses the previous iteration", () => {
  const input = event("turn.input.recorded", NDX_TURN_EVENT.InputRecorded, { text: "inspect files" });
  const first = event("turn.tool.batch:1", NDX_TURN_EVENT.ToolBatchStarted, {
    kind: "tool_call",
    iteration: 1,
    toolCalls: []
  });
  const second = event("turn.tool.batch:2", NDX_TURN_EVENT.ToolBatchStarted, {
    kind: "tool_call",
    iteration: 2,
    toolCalls: []
  });
  const third = event("turn.tool.batch:3", NDX_TURN_EVENT.ToolBatchStarted, {
    kind: "tool_call",
    iteration: 3,
    toolCalls: []
  });

  const firstTwo = [input, first, second].reduce(applyTurnEvent, []);
  const reopenedFirst = firstTwo.map((turn) => ({
    ...turn,
    batches: turn.batches.map((batch) => batch.iteration === 1 ? { ...batch, collapsed: false, manuallyExpanded: true } : batch)
  }));
  const turn = applyTurnEvent(reopenedFirst, third).at(-1);

  assert.deepEqual(turn?.batches.map((batch) => ({
    iteration: batch.iteration,
    collapsed: batch.collapsed,
    manuallyExpanded: batch.manuallyExpanded
  })), [
    { iteration: 1, collapsed: false, manuallyExpanded: true },
    { iteration: 2, collapsed: true, manuallyExpanded: false },
    { iteration: 3, collapsed: false, manuallyExpanded: false }
  ]);
});

test("turn reducer lets interrupt completion override a saved assistant message", () => {
  const input = event("turn.input.recorded", NDX_TURN_EVENT.InputRecorded, { text: "long task" });
  const assistant = event("turn.assistant.recorded", NDX_TURN_EVENT.AssistantRecorded, { kind: "assistant_message", text: "partial answer" });
  const completed = event("turn.interrupt.completed", NDX_TURN_EVENT.InterruptCompleted, { kind: "interrupt_completed", phase: "model_request" });

  const turn = [input, assistant, completed].reduce(applyTurnEvent, []).at(-1);

  assert.equal(turn?.status, "interrupted");
  assert.equal(turn?.collapsed, true);
});

test("turn reducer records model progress notices as iteration events", () => {
  const input = event("turn.input.recorded", NDX_TURN_EVENT.InputRecorded, { kind: "user_message", text: "slow local model" });
  const request = event("turn.model.request", NDX_TURN_EVENT.ModelRequest, { kind: "model_request", iteration: 1, messageCount: 6 });
  const progress = event("turn.model.progress:1", NDX_TURN_EVENT.ModelProgress, {
    kind: "model_progress",
    iteration: 1,
    elapsedMs: 120_000,
    intervalMs: 120_000,
    message: "모델 요청이 120초 동안 진행 중입니다. 더 기다리지 않으려면 세션을 인터럽트하세요."
  });

  const turn = [input, request, progress].reduce(applyTurnEvent, []).at(-1);

  assert.deepEqual(turn?.batches[0]?.modelEvents, [
    "Model request (iteration 1, 6 messages)",
    "모델 요청이 120초 동안 진행 중입니다. 더 기다리지 않으려면 세션을 인터럽트하세요."
  ]);
});

test("turn reducer records prefix drift warnings as model iteration events", () => {
  const input = event("turn.input.recorded", NDX_TURN_EVENT.InputRecorded, { kind: "user_message", text: "inspect prefix" });
  const request = event("turn.model.request", NDX_TURN_EVENT.ModelRequest, { kind: "model_request", iteration: 1, messageCount: 6 });
  const drift = event("turn.prefix.drift:1", NDX_TURN_EVENT.PrefixDrift, {
    kind: "prefix_drift",
    iteration: 1,
    label: "responseapi input fallback",
    message: "Model provider rejected the first Responses input serialization, so ndx retried the same model request with a different input serialization.",
    previousMessageCount: 6,
    nextMessageCount: 6,
    stablePrefixLength: 6
  });

  const turn = [input, request, drift].reduce(applyTurnEvent, []).at(-1);

  assert.deepEqual(turn?.batches[0]?.modelEvents, [
    "Model request (iteration 1, 6 messages)",
    "Prefix drift warning: Model provider rejected the first Responses input serialization, so ndx retried the same model request with a different input serialization."
  ]);
});

function event(dataid: string, name: NDXSessionEventMessage["event"], contents: NDXSessionEventMessage["contents"]): NDXSessionEventMessage {
  return {
    type: "session.event",
    sessionid: "session-1",
    event: name,
    dataid,
    contents,
    createdat: "2026-05-22T00:00:00.000Z"
  };
}
