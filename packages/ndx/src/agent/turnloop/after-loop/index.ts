import { assistantMessageContents } from "../../session/content.js";
import { appendSessionData } from "../../session/appendSessionData.js";
import { updateSessionEndTurn } from "../../session/updateSession.js";
import { NDX_TURN_EVENT } from "../../../common/protocol/index.js";
import { compactReplayContents } from "../../compact/index.js";
import { compactTurnContext } from "../base/compact/index.js";
import { refreshTurnMessages, runTurnEndForState } from "../base/state/index.js";
import type { NDXContextUsage } from "../../contextusage/index.js";
import type { NDXHookCompactEffect } from "../../hook/index.js";
import type { NDXSessionDataRow } from "../../session/types.js";
import type { NDXActiveTurnPipelineState } from "../types.js";

// This finalizer ends exactly one turn. The final turn.end hook may declare
// post-response effects, but the current turn is already being closed.
export async function finishAfterLoop(state: NDXActiveTurnPipelineState): Promise<void> {
  try {
    await state.interrupt.setPhase("finalizing");
    const assistant = await appendSessionData(state.database, state.runningSession.sessionid, "assistant", assistantMessageContents(state.assistantText));
    const finalContextUsage = state.turnContextUsage(state.assistantText);
    await state.events.onEvent?.({ type: NDX_TURN_EVENT.AssistantRecorded, iteration: state.finalIteration, assistant, contextUsage: finalContextUsage });
    const endedSession = await updateSessionEndTurn(state.database, state.runningSession.sessionid);
    await state.events.onEvent?.({ type: NDX_TURN_EVENT.TurnEnd, iteration: state.finalIteration, session: endedSession, contextUsage: finalContextUsage });
    state.runningSession = endedSession;
    await runTurnEndForState(state, assistant, state.finalIteration, state.assistantText, finalContextUsage);
  } catch (error) {
    await state.pipeline.handleTurnFailure(state, error);
  }
}

export async function finishCompactTurn(
  state: NDXActiveTurnPipelineState,
  compactEffect: NDXHookCompactEffect,
  contextRows: NDXSessionDataRow[],
  contextUsage: NDXContextUsage
): Promise<void> {
  try {
    const sourceRows = contextRows.filter((row) => isBeforeDataId(row.dataid, state.input.dataid));
    const replayRows = contextRows.filter((row) => !isBeforeDataId(row.dataid, state.input.dataid));
    await compactTurnContext(state, compactEffect, sourceRows, contextUsage, "");
    if (replayRows.length > 0) {
      await appendSessionData(state.database, state.runningSession.sessionid, "system", compactReplayContents(replayRows));
      await refreshTurnMessages(state);
    }
    const compactContextUsage = state.turnContextUsage();
    const compactTurnEndText = [
      "컨텍스트 한계에 가까워져 세션 히스토리를 compact했습니다.",
      "이 compact는 이터레이션 중간에 실행되었으므로 현재 턴은 여기서 종료됩니다.",
      "직전 턴의 직접 히스토리는 compact 뒤에 보존되며, 세션 서버가 새 턴에서 이어서 처리할 수 있습니다."
    ].join("\n");
    const assistant = await appendSessionData(
      state.database,
      state.runningSession.sessionid,
      "assistant",
      assistantMessageContents(compactTurnEndText)
    );
    await state.events.onEvent?.({ type: NDX_TURN_EVENT.AssistantRecorded, iteration: state.activeIteration || state.finalIteration, assistant, contextUsage: compactContextUsage });
    const endedSession = await updateSessionEndTurn(state.database, state.runningSession.sessionid);
    await state.events.onEvent?.({ type: NDX_TURN_EVENT.TurnEnd, iteration: state.activeIteration || state.finalIteration, session: endedSession, contextUsage: compactContextUsage });
    state.runningSession = endedSession;
    await runTurnEndForState(state, assistant, state.activeIteration || state.finalIteration, compactTurnEndText, compactContextUsage, {
      sessionRequestQueueConsumerBridge: null
    });
  } catch (error) {
    await state.pipeline.handleTurnFailure(state, error);
  }
}

function isBeforeDataId(dataid: string | number, boundary: string | number): boolean {
  const current = Number(dataid);
  const target = Number(boundary);
  if (!Number.isFinite(current) || !Number.isFinite(target)) {
    return String(dataid) < String(boundary);
  }
  return current < target;
}
