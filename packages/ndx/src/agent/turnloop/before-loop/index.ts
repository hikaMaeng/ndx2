import { NDX_TURN_EVENT } from "../../../common/protocol/index.js";
import { refreshTurnMessages } from "../base/state/index.js";
import type { NDXActiveTurnPipelineState } from "../types.js";

export async function prepareBeforeLoop(state: NDXActiveTurnPipelineState): Promise<void> {
  try {
    await refreshTurnMessages(state);
    state.inputContextUsage = state.turnContextUsage();
    await state.interrupt.setPhase("context");
    state.database.logger?.info(NDX_TURN_EVENT.ContextReady, {
      sessionid: state.runningSession.sessionid,
      messageCount: state.messages.length,
      contextTokens: state.inputContextUsage.tokens,
      toolDefinitionTokens: state.inputContextUsage.toolDefinitionTokens,
      contextsize: state.inputContextUsage.contextsize
    });
    await state.events.onEvent?.({ type: NDX_TURN_EVENT.ContextReady, messageCount: state.messages.length, contextUsage: state.inputContextUsage });
    await state.events.onEvent?.({ type: NDX_TURN_EVENT.InputRecorded, input: state.input, contextUsage: state.inputContextUsage });
    state.activeIteration = 1;
    return state.pipeline.prepareTurnIteration(state);
  } catch (error) {
    return state.pipeline.handleTurnFailure(state, error);
  }
}
