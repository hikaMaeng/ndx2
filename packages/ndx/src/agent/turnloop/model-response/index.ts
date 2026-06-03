import { NDX_TURN_EVENT } from "../../../common/protocol/index.js";
import type { ModelResponse } from "ndx/common/responseapi";
import type { NDXActiveTurnPipelineState } from "../types.js";

export async function handleModelResponse(state: NDXActiveTurnPipelineState, response: ModelResponse): Promise<void> {
  try {
    if (response.toolCalls.length > 0) {
      return state.pipeline.processToolCalls(state, response);
    }
    state.assistantText = response.content;
    state.finalIteration = state.activeIteration || 1;
    state.database.logger?.info(NDX_TURN_EVENT.ModelResponse, {
      sessionid: state.runningSession.sessionid,
      iteration: state.finalIteration,
      model: state.runningSession.model.model,
      contentLength: state.assistantText.length
    });
    return state.pipeline.finishAfterLoop(state);
  } catch (error) {
    return state.pipeline.handleTurnFailure(state, error);
  }
}
