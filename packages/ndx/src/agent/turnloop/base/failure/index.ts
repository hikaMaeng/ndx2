import { assistantMessageContents, errorContents } from "../../../session/content.js";
import { appendSessionData } from "../../../session/appendSessionData.js";
import { completeSessionInterrupt } from "../../../session/interruptSession.js";
import { updateSessionEndTurn } from "../../../session/updateSession.js";
import { NDX_TURN_EVENT } from "../../../../common/protocol/index.js";
import { isTurnInterruptedError } from "../interrupt/index.js";
import { requireActiveTurnState, runTurnEndForState } from "../state/index.js";
import type { NDXTurnPipelineState } from "../../types.js";

export async function handleTurnFailure(state: NDXTurnPipelineState, error: unknown): Promise<void> {
  requireActiveTurnState(state);
  const interruptedError = isTurnInterruptedError(error)
    ? error
    : isTurnInterruptedError(state.interrupt.signal.reason)
      ? state.interrupt.signal.reason
      : undefined;
  if (interruptedError) {
    state.database.logger?.info(NDX_TURN_EVENT.Interrupted, {
      sessionid: state.runningSession.sessionid,
      phase: interruptedError.phase
    });
    const contextUsage = state.turnContextUsage(state.assistantText);
    await state.events.onEvent?.({ type: NDX_TURN_EVENT.Interrupted, phase: interruptedError.phase, contextUsage });
    const assistant = await appendSessionData(
      state.database,
      state.runningSession.sessionid,
      "assistant",
      state.assistantText.trim().length > 0 ? assistantMessageContents(state.assistantText) : errorContents(interruptedError.message)
    );
    await state.events.onEvent?.({ type: NDX_TURN_EVENT.AssistantRecorded, iteration: state.activeIteration || state.finalIteration, assistant, contextUsage });
    const updatedSession = await completeSessionInterrupt(state.database, state.runningSession.sessionid);
    await state.events.onEvent?.({ type: NDX_TURN_EVENT.InterruptCompleted, phase: interruptedError.phase, session: updatedSession, contextUsage });
    state.runningSession = updatedSession;
    await runTurnEndForState(state, assistant, state.activeIteration || state.finalIteration, state.assistantText, contextUsage);
    return;
  }
  state.database.logger?.warn(NDX_TURN_EVENT.Failed, {
    sessionid: state.runningSession.sessionid,
    iteration: state.activeIteration,
    model: state.runningSession.model.model,
    providerUrl: state.runningSession.model.url,
    error: error instanceof Error ? error.message : String(error)
  });
  const assistant = await appendSessionData(
    state.database,
    state.runningSession.sessionid,
    "assistant",
    errorContents(state.assistantText || (error instanceof Error ? error.message : "model request failed."))
  );
  const contextUsage = state.turnContextUsage(state.assistantText);
  await state.events.onEvent?.({ type: NDX_TURN_EVENT.AssistantRecorded, iteration: state.activeIteration || state.finalIteration, assistant, contextUsage });
  const endedSession = await updateSessionEndTurn(state.database, state.runningSession.sessionid);
  await state.events.onEvent?.({ type: NDX_TURN_EVENT.TurnEnd, iteration: state.activeIteration || state.finalIteration, session: endedSession, contextUsage });
  state.runningSession = endedSession;
  await runTurnEndForState(state, assistant, state.activeIteration || state.finalIteration, state.assistantText, contextUsage);
}
