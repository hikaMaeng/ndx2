import { assistantMessageContents } from "../../session/content.js";
import { appendSessionData } from "../../session/appendSessionData.js";
import { updateSessionEndTurn } from "../../session/updateSession.js";
import { NDX_TURN_EVENT } from "../../../common/protocol/index.js";
import { runTurnEndForState } from "../base/state/index.js";
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
