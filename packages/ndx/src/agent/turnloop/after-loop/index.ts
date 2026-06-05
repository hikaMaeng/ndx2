import { assistantMessageContents } from "../../session/content.js";
import { appendSessionData } from "../../session/appendSessionData.js";
import { updateSessionEndTurn } from "../../session/updateSession.js";
import { cotWorkCompletedSidebarItems } from "../../tool/base/cot_work/sidebar.js";
import { NDX_TURN_EVENT } from "../../../common/protocol/index.js";
import { compactTurnContext } from "../base/compact/index.js";
import { runTurnEndForState } from "../base/state/index.js";
import type { NDXContextUsage } from "../../contextusage/index.js";
import type { NDXHookCompactEffect } from "../../hook/index.js";
import type { NDXSessionDataRow } from "../../session/types.js";
import type { NDXActiveTurnPipelineState } from "../types.js";

export async function finishAfterLoop(state: NDXActiveTurnPipelineState): Promise<void> {
  try {
    await state.interrupt.setPhase("finalizing");
    const assistant = await appendSessionData(state.database, state.runningSession.sessionid, "assistant", assistantMessageContents(state.assistantText));
    const finalContextUsage = state.turnContextUsage(state.assistantText);
    await state.events.onEvent?.({ type: NDX_TURN_EVENT.AssistantRecorded, iteration: state.finalIteration, assistant, contextUsage: finalContextUsage });
    const endedSession = await updateSessionEndTurn(state.database, state.runningSession.sessionid);
    await state.events.onEvent?.({ type: NDX_TURN_EVENT.TurnEnd, iteration: state.finalIteration, session: endedSession, contextUsage: finalContextUsage });
    await runTurnEndForState(state, assistant, state.finalIteration, state.assistantText, finalContextUsage);
    const finalCotWork = state.cotWorkTiming.complete();
    if (finalCotWork) {
      await appendSessionData(state.database, state.runningSession.sessionid, "assistant", finalCotWork);
      for (const item of cotWorkCompletedSidebarItems(finalCotWork)) {
        await state.events.onEvent?.({
          type: NDX_TURN_EVENT.SidebarItem,
          iteration: state.finalIteration,
          tool: "cot_work",
          item,
          contextUsage: finalContextUsage
        });
      }
      await state.events.onEvent?.({
        type: NDX_TURN_EVENT.CotWork,
        iteration: state.finalIteration,
        tool: "cot_work",
        contents: finalCotWork,
        contextUsage: finalContextUsage
      });
    }
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
    const compactContextUsage = await compactTurnContext(state, compactEffect, contextRows, contextUsage, "");
    const compactTurnEndText = [
      "컨텍스트 한계에 가까워져 세션 히스토리를 compact했습니다.",
      "이 compact는 이터레이션 중간에 실행되었으므로 현재 턴은 여기서 종료됩니다.",
      "다음 요청은 새 compact 요약 이후의 히스토리로 이어서 처리됩니다."
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
    await runTurnEndForState(state, assistant, state.activeIteration || state.finalIteration, compactTurnEndText, compactContextUsage);
  } catch (error) {
    await state.pipeline.handleTurnFailure(state, error);
  }
}
