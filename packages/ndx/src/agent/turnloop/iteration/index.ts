import { runTurnContextPreparedHook } from "../../hook/turn.context.prepared/index.js";
import { NDX_AGENT_RESOURCE } from "../../../common/resource/index.js";
import { refreshTurnMessages } from "../base/state/index.js";
import type { NDXActiveTurnPipelineState } from "../types.js";

export async function prepareTurnIteration(state: NDXActiveTurnPipelineState): Promise<void> {
  try {
    const iteration = state.activeIteration || 1;
    state.activeIteration = iteration;
    await state.interrupt.checkpoint();
    await refreshTurnMessages(state);
    if (iteration > state.runtimeSettings.maxModelIterations) {
      const finalContextUsage = state.turnContextUsage("", []);
      await state.interrupt.setPhase("model_request");
      const contextPreparedHook = await runTurnContextPreparedHook(state.hookRuntime, {
        database: state.database,
        session: state.runningSession,
        input: state.input,
        requestText: state.text,
        userHome: state.userHome,
        projectHome: state.projectHome,
        language: state.language,
        resource: state.resource,
        iteration,
        messages: state.messages,
        previousModelRequestStablePrefix: state.lastModelRequestStablePrefix,
        sessionDataRows: state.currentMessageParts?.historyRows,
        availableTools: state.availableTools,
        modelTools: state.modelTools,
        contextUsage: finalContextUsage
      });
      state.messages = contextPreparedHook.messages;
      state.modelTools = contextPreparedHook.modelTools;
      state.inputContextUsage = state.turnContextUsage();
      if (contextPreparedHook.stopTurn) {
        state.assistantText = contextPreparedHook.finalAssistantText ?? state.t(NDX_AGENT_RESOURCE.TURN_HOOK_CONTEXT_PREPARED_STOPPED_MESSAGE);
        state.finalIteration = iteration;
        return state.pipeline.finishAfterLoop(state);
      }
      return state.pipeline.callTurnModel(state, { finalizingAfterIterationLimit: true, contextUsage: finalContextUsage });
    }

    const contextUsage = state.turnContextUsage();
    await state.interrupt.setPhase("model_request");
    const contextPreparedHook = await runTurnContextPreparedHook(state.hookRuntime, {
      database: state.database,
      session: state.runningSession,
      input: state.input,
      requestText: state.text,
      userHome: state.userHome,
      projectHome: state.projectHome,
      iteration,
      messages: state.messages,
      previousModelRequestStablePrefix: state.lastModelRequestStablePrefix,
      sessionDataRows: state.currentMessageParts?.historyRows,
      availableTools: state.availableTools,
      modelTools: state.modelTools,
      contextUsage
    });
    state.messages = contextPreparedHook.messages;
    state.modelTools = contextPreparedHook.modelTools;
    state.inputContextUsage = state.turnContextUsage();
    if (contextPreparedHook.stopTurn) {
      state.assistantText = contextPreparedHook.finalAssistantText ?? state.t(NDX_AGENT_RESOURCE.TURN_HOOK_CONTEXT_PREPARED_STOPPED_MESSAGE);
      state.finalIteration = iteration;
      return state.pipeline.finishAfterLoop(state);
    }
    const modelRequestContextUsage = state.turnContextUsage();
    return state.pipeline.callTurnModel(state, { contextUsage: modelRequestContextUsage });
  } catch (error) {
    return state.pipeline.handleTurnFailure(state, error);
  }
}
